import { generateImageRequestSchema, gptSizeOf, imageModelOf } from "@aigc-flow/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { getAppSettings } from "../db/settings";

/** 内网 /aigc 的返回结构（docs/接口文档.md） */
type AigcResponse = {
  result?: {
    content?: string[];
    status?: string;
    error?: Record<string, unknown>;
  };
};

export const generateRoute = new Hono().post(
  "/",
  zValidator("json", generateImageRequestSchema),
  async (c) => {
    const input = c.req.valid("json");
    const { generateBaseUrl, reqFrom } = getAppSettings();

    if (!reqFrom) {
      return c.json({ message: "请先在设置面板填写请求来源标识（req_from）" }, 400);
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

    // 内网接口是同步阻塞式的，发出后一直等到生成完成才返回，不设超时
    let res: Response;
    try {
      res = await fetch(`${generateBaseUrl}/aigc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error("[generate] fetch failed", error);
      return c.json({ message: "连不上内网生成服务，确认在内网环境且地址配置正确" }, 502);
    }

    if (!res.ok) {
      return c.json({ message: `内网生成服务返回 ${res.status}` }, 502);
    }

    const body = (await res.json().catch(() => null)) as AigcResponse | null;
    const url = body?.result?.content?.[0];
    if (body?.result?.status !== "success" || !url) {
      console.error("[generate] bad response", JSON.stringify(body));
      return c.json({ message: "生成失败，内网服务未返回有效结果" }, 502);
    }

    return c.json({ url });
  },
);
