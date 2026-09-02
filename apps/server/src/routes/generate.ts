import {
  clampVideoConfig,
  generateImageRequestSchema,
  generateVideoRequestSchema,
  gptSizeOf,
  imageModelOf,
  videoVersionOf,
} from "@aigc-flow/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { Agent, fetch as undiciFetch } from "undici";
import { db } from "../db";
import { generations } from "../db/schema";
import { getAppSettings } from "../db/settings";
import { messageOf, snippet } from "../lib/upstream";

/** 内网 /aigc 的返回结构 */
type AigcResponse = {
  result?: {
    content?: string[];
    status?: string;
    error?: Record<string, unknown>;
  };
};

/**
 * 转发生成请求专用的连接配置。内网 /aigc 是同步阻塞式的，发出后一直等到生成完成
 * 才返回，受算力影响单次可能长达 10-30 分钟。Node 自带 fetch 底层是 undici，
 * 默认 headersTimeout / bodyTimeout 都是 300 秒：5 分钟没等到响应头就抛
 * `fetch failed`（cause 是 HeadersTimeoutError），之前被一律当成「连不上内网」报出去，
 * 表现就是「配置和网络都正常，慢一点的生成却偶发连不上」。
 * 这里两个等待超时都关掉（0 = 不限），只保留建连超时：真连不上还是要快点报。
 */
const aigcAgent = new Agent({ headersTimeout: 0, bodyTimeout: 0, connectTimeout: 10_000 });

/** 建连阶段的错误码：这些才是真的「连不上」，其余都是连上以后出的事 */
const CONNECT_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
]);

/** fetch 抛出的 `fetch failed` 本身没信息，真正的原因在 cause 上 */
function fetchFailureOf(error: unknown): { code: string; detail: string } {
  const cause = (error as { cause?: unknown })?.cause;
  const source = (cause ?? error) as { code?: unknown; message?: unknown } | null;
  const code = typeof source?.code === "string" ? source.code : "";
  const detail = typeof source?.message === "string" ? source.message : String(source ?? error);
  return { code, detail: snippet(detail) };
}

/** 转发到内网 /aigc 并取出结果地址 */
async function callAigc(
  endpoint: string,
  payload: Record<string, unknown>,
): Promise<{ url: string } | { message: string }> {
  let res: Awaited<ReturnType<typeof undiciFetch>>;
  try {
    // 用 undici 自己的 fetch 而不是全局 fetch：dispatcher 要和 fetch 来自同一份 undici
    res = await undiciFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      dispatcher: aigcAgent,
    });
  } catch (error) {
    const { code, detail } = fetchFailureOf(error);
    console.error("[generate] fetch failed", code || "(no code)", detail);
    if (!code || CONNECT_ERROR_CODES.has(code)) {
      return { message: "连不上内网生成服务，确认在内网环境且地址配置正确" };
    }
    // 连上了但没等到完整响应（对端断开、中途网络抖动等），把原因如实带出去
    return { message: `等待内网生成服务返回时中断（${code}${detail ? `：${detail}` : ""}）` };
  }

  if (!res.ok) {
    // 非 200 时把响应体带出来，别让用户只看到一个状态码
    const text = snippet(await res.text().catch(() => ""));
    return { message: `内网生成服务返回 ${res.status}${text ? `：${text}` : ""}` };
  }

  const body = (await res.json().catch(() => null)) as AigcResponse | null;
  const url = body?.result?.content?.[0];
  if (body?.result?.status !== "success" || !url) {
    console.error("[generate] bad response", JSON.stringify(body));
    const detail = errorDetailOf(body?.result?.error);
    return { message: detail ? `生成失败：${detail}` : "生成失败，内网服务未返回有效结果" };
  }
  return { url };
}

/** 把内网返回的 result.error 提炼成一句人能读的话，透传给前端和流水表 */
function errorDetailOf(error: unknown): string {
  const detail = messageOf(error);
  if (detail) return detail;
  if (!error) return "";
  if (typeof error === "object") {
    const serialized = JSON.stringify(error);
    return serialized === "{}" ? "" : snippet(serialized);
  }
  return String(error);
}

/** 记一条生成流水（成功失败都记），按项目归属，统计面板和成本核算用 */
function recordGeneration(
  projectId: number,
  kind: "image" | "video",
  payload: Record<string, unknown>,
  outcome: { url: string } | { message: string },
  durationSeconds?: number,
) {
  db.insert(generations)
    .values({
      projectId,
      kind,
      payload: JSON.stringify(payload),
      status: "url" in outcome ? "success" : "error",
      error: "message" in outcome ? outcome.message : null,
      resultUrl: "url" in outcome ? outcome.url : null,
      durationSeconds: durationSeconds ?? null,
    })
    .run();
}

export const generateRoute = new Hono()
  .post("/", zValidator("json", generateImageRequestSchema), async (c) => {
    const input = c.req.valid("json");
    const { generateUrl, reqFrom } = getAppSettings();

    if (!reqFrom) {
      return c.json({ message: "请先在设置面板填写请求来源标识（req_from）" }, 400);
    }
    if (!generateUrl) {
      return c.json({ message: "请先在设置面板填写 AIGC 生成接口地址" }, 400);
    }

    const model = imageModelOf(input.model);
    // 两家模型的 config 形状不同：gpt 是 size/n/quality，nano 是 aspect_ratio/image_size
    const config =
      input.model === "gpt-image-2"
        ? { size: gptSizeOf(input.sizePreset).size, n: 1, quality: input.quality }
        : { aspect_ratio: input.aspectRatio, image_size: input.imageSize };

    const payload = {
      req_from: reqFrom,
      model_name: model.modelName,
      version: model.version,
      prompt: input.prompt,
      image_list: input.imageList,
      config,
    };

    const outcome = await callAigc(generateUrl, payload);
    recordGeneration(input.projectId, "image", payload, outcome);
    if ("message" in outcome) return c.json({ message: outcome.message }, 502);
    return c.json({ url: outcome.url });
  })
  .post("/video", zValidator("json", generateVideoRequestSchema), async (c) => {
    const raw = c.req.valid("json");
    const { generateUrl, reqFrom } = getAppSettings();

    if (!reqFrom) {
      return c.json({ message: "请先在设置面板填写请求来源标识（req_from）" }, 400);
    }
    if (!generateUrl) {
      return c.json({ message: "请先在设置面板填写 AIGC 生成接口地址" }, 400);
    }

    // 版本 / 模式相关的参数约束统一在 shared 的 clampVideoConfig 里收敛
    const input = clampVideoConfig(raw);
    const version = videoVersionOf(input.version);

    const payload = {
      req_from: reqFrom,
      model_name: "seedance",
      version: version.apiVersion,
      mode: input.mode,
      prompt: input.prompt,
      image_list: input.imageList,
      video_list: input.videoList,
      audio_list: input.audioList,
      config: {
        resolution: input.resolution,
        ratio: input.ratio,
        duration: input.duration,
        generate_audio: input.generateAudio,
      },
    };

    const outcome = await callAigc(generateUrl, payload);
    recordGeneration(input.projectId, "video", payload, outcome, input.duration);
    if ("message" in outcome) return c.json({ message: outcome.message }, 502);
    return c.json({ url: outcome.url });
  });
