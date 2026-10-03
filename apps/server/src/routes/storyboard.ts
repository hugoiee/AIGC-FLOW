import {
  llmChatEndpoint,
  PERFORMANCE_PROMPT_SYSTEM,
  storyboardGenerateRequestSchema,
} from "@aigc-flow/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { getAppSettings } from "../db/settings";
import { failureMessageOf, headersOf, replyTextOf, upstreamErrorOf } from "../lib/llm";

/**
 * 生成表演 Prompt 要模型真写一大段，二十来镜的表能跑上一两分钟；
 * 本地 vLLM / ollama 首次还要把权重加载进显存。给得比最小验证再宽一点，
 * 卡在这里报超时是假阴性 —— 配置其实是对的。
 */
const GENERATE_TIMEOUT_MS = 180_000;

/**
 * 输出的 token 上限，按要生成的镜数算。
 *
 * **必须显式给** —— Anthropic 的接口把 max_tokens 列为必填，OpenAI 协议的网关
 * 转发时得自己补一个，而有的网关补的是个极小的默认值：请求 200、
 * choices[0].message.content 是空串，看起来像「模型不听话没返回 JSON」，
 * 实际是被截没了。踩过一次，排查方向完全反了。
 */
function maxTokensOf(shots: number): number {
  return Math.min(1_000 + shots * 400, 16_000);
}

/**
 * 模型常把 JSON 裹进 ```json 围栏里，或者在前后加一句「好的，以下是…」。
 * 提示词里已经说了不要，但这是**软约束**，不能指望它每次都听 ——
 * 所以取第一个 `{` 到最后一个 `}` 之间的部分，围栏和寒暄一起被削掉。
 */
function jsonSliceOf(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

/**
 * 从模型回复里取出 { index, prompt } 列表。
 *
 * **按 index 对齐，不按顺序** —— 模型偶尔会少给一条或换个次序，
 * 靠位置对的话结果会整体串行，而串行了从表面上看不出来，最难查。
 * 顺手容忍两种常见变体：顶层直接是数组、字段叫 prompt 之外的名字。
 */
function promptsOf(text: string): { index: number; prompt: string }[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonSliceOf(text));
  } catch {
    return [];
  }

  const list = Array.isArray(parsed) ? parsed : (parsed as { prompts?: unknown })?.prompts;
  if (!Array.isArray(list)) return [];

  return list
    .map((item) => {
      const record = item as { index?: unknown; prompt?: unknown; performancePrompt?: unknown };
      const index = typeof record?.index === "number" ? record.index : Number.NaN;
      const prompt =
        typeof record?.prompt === "string"
          ? record.prompt
          : typeof record?.performancePrompt === "string"
            ? record.performancePrompt
            : "";
      return { index, prompt: prompt.trim() };
    })
    .filter((item) => Number.isInteger(item.index) && item.index >= 0 && item.prompt !== "");
}

export const storyboardRoute = new Hono().post(
  "/performance-prompts",
  zValidator("json", storyboardGenerateRequestSchema),
  async (c) => {
    const { rows, only } = c.req.valid("json");
    const settings = getAppSettings();

    // LLM 是可选功能（空串 = 没配），这里是第一个真正依赖它的地方。
    // 400 而不是 502：错在配置，不在上游
    if (!settings.llmBaseUrl || !settings.llmModel) {
      return c.json({ message: "还没配置 LLM。在设置面板里填好地址和模型后再生成" }, 400);
    }

    // 不给 only 就是整表。越界的下标在这里先滤掉，别让模型去猜
    const wanted = (only ?? rows.map((_, index) => index)).filter(
      (index) => index >= 0 && index < rows.length,
    );
    if (wanted.length === 0) return c.json({ prompts: [] });

    const payload = {
      // 整表都给，模型才能把前后镜写连贯；下标显式带上，回来时按它对齐
      shots: rows.map((row, index) => ({ index, ...row })),
      generate: wanted,
    };

    let res: Response;
    try {
      res = await fetch(llmChatEndpoint(settings.llmBaseUrl), {
        method: "POST",
        headers: headersOf(settings.llmApiKey),
        body: JSON.stringify({
          model: settings.llmModel,
          messages: [
            { role: "system", content: PERFORMANCE_PROMPT_SYSTEM },
            { role: "user", content: JSON.stringify(payload) },
          ],
          max_tokens: maxTokensOf(wanted.length),
          stream: false,
        }),
        signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
      });
    } catch (error) {
      return c.json(
        { message: failureMessageOf(error, "生成表演 Prompt", GENERATE_TIMEOUT_MS) },
        502,
      );
    }

    if (!res.ok) return c.json({ message: await upstreamErrorOf(res) }, 502);

    const reply = replyTextOf(await res.json().catch(() => null));
    const prompts = promptsOf(reply).filter((item) => wanted.includes(item.index));

    if (prompts.length === 0) {
      // 连上了、也回话了，但吐的不是能用的 JSON。把开头带出来，
      // 光说「解析失败」的话没法判断是模型不听话还是打错了模型
      console.error("[storyboard] 无法解析模型回复:", reply.slice(0, 500));
      // 「吐了但不是 JSON」和「整个是空的」的处置完全不同，分开说。
      // 后者实际踩到过：某些 OpenAI 协议网关会回 200、usage 里
      // completion_tokens 照常计费，choices[0].message.content 却是空串 ——
      // 换个模型或换个服务商就好了，改提示词是白费功夫，所以必须指对方向
      const detail = reply
        ? `它回的是：${reply.slice(0, 120)}`
        : "服务返回成功但正文是空的（用量照常计费）。这多半是这个 LLM 服务商的问题，换个模型或换个地址试试";
      return c.json({ message: `模型没有按要求返回内容。${detail}` }, 502);
    }

    return c.json({ prompts });
  },
);
