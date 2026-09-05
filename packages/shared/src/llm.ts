import { z } from "zod";

/**
 * OpenAI 协议兼容服务的 base 地址。约定**填到版本段为止**（通常是 `.../v1`），
 * 代码只在后面拼 `/models` 和 `/chat/completions`。
 *
 * 刻意不自动补 `/v1`：兼容服务的前缀千奇百怪（ollama 是 `/v1`，部分网关是
 * `/openai/v1`，自建 vLLM 有时干脆没有版本段），补错了比不补更难排查。
 */
export const llmEndpointSchema = z
  .url({ protocol: /^https?$/, error: "请输入 http(s) 开头的完整地址" })
  .transform((value) => value.replace(/\/+$/, ""));

/**
 * 存进设置时用的可空版本。空串是合法值：表示还没配 LLM，
 * 此时不校验、也不会发任何请求（和三个内网地址不同，LLM 是可选功能）。
 *
 * union 必须自己带 error：不写的话两个分支各自的报错会被裹进
 * `issue.errors` 里，顶层只剩一句英文的 "Invalid input" —— 面板读的是顶层那句。
 */
export const llmBaseUrlSchema = z.union([z.literal(""), llmEndpointSchema], {
  error: "请输入 http(s) 开头的完整地址，或留空表示不启用",
});

/** 列模型：`GET <base>/models` */
export function llmModelsEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/models`;
}

/** 对话补全：`POST <base>/chat/completions` */
export function llmChatEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

/**
 * API Key 的掩码预览。**真 key 不出服务端**：面板打开时拿到的是这个字符串，
 * 输入框本身始终是空的，空 = 不改动已存的 key（见 `appSettingsSchema.llmApiKey`）。
 */
export function maskApiKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "•".repeat(key.length);
  return `${key.slice(0, 3)}…${key.slice(-4)}`;
}

/**
 * 两个探测接口的公共入参。地址和 key 都由前端传：设置面板要支持
 * 「还没保存就先测一下」。`apiKey` 留空 = 用服务端已存的那份
 * （面板里 key 是掩码展示的，用户不改就压根发不出真 key）。
 */
export const llmProbeRequestSchema = z.object({
  baseUrl: llmEndpointSchema,
  apiKey: z.string().trim().max(500),
});

export type LlmProbeRequest = z.infer<typeof llmProbeRequestSchema>;

/** 最小验证请求：在探测入参上多一个要打的模型 */
export const llmVerifyRequestSchema = llmProbeRequestSchema.extend({
  model: z.string().trim().min(1, "请先填写或选择模型"),
});

export type LlmVerifyRequest = z.infer<typeof llmVerifyRequestSchema>;
