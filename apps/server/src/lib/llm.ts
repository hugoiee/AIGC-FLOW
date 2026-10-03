import { getAppSettings } from "../db/settings";
import {
  fetchFailureOf,
  isConnectFailure,
  isTlsHandshakeFailure,
  messageOf,
  snippet,
} from "./upstream";

/**
 * OpenAI 协议兼容服务的公共部分：请求头、Key 取用、失败翻译、回复取文本。
 * /api/llm（探测）和 /api/storyboard（生成表演 Prompt）共用这一份 ——
 * 抄两遍的话「超时该报什么」这类判断迟早会在一边漏掉。
 */
/** OpenAI 协议：没有 key 时不要发空的 Authorization 头，本地 ollama / vLLM 常常压根不校验 */
export function headersOf(apiKey: string): Record<string, string> {
  return apiKey
    ? { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }
    : { "Content-Type": "application/json" };
}

/**
 * key 留空 = 用服务端已存的那份（契约见 shared 的 `appSettingsSchema`）。
 * 面板里 key 永远是掩码，用户不重填就发不出真 key，探测照样要能跑。
 */
export function apiKeyOf(input: string): string {
  return input || getAppSettings().llmApiKey;
}

/** 请求失败时统一翻译成一句人能照做的话 */
export function failureMessageOf(error: unknown, what: string, timeoutMs: number): string {
  // AbortSignal.timeout 抛的是 TimeoutError，它没有 errno code，
  // 不特判会掉进 isConnectFailure 的「没 code 就算连不上」分支里，报错就指错方向了
  if ((error as { name?: string })?.name === "TimeoutError") {
    // 超时只说「超时了」没有用，得说清下一步该干什么：这两种原因的处置完全相反
    return `${what}超时（等了 ${Math.round(timeoutMs / 1000)} 秒）。若是本地服务首次加载模型，稍后重试即可；一直超时就检查这个地址背后的服务是否正常`;
  }
  const { code, detail } = fetchFailureOf(error);
  console.error("[llm] fetch failed", code || "(no code)", detail);
  if (isTlsHandshakeFailure(code, detail)) {
    // 这三个原因都会长成同一个样子，而且都不是「服务挂了」，所以得一次列全：
    // 只说「连不上」的话，用户会去 ping 一个其实活得好好的服务
    return "和这个地址的 TLS 握手被中断。常见于出网要走代理 —— 服务端不读系统代理设置，浏览器能打开不代表这里能打开；也可能是防火墙拦了，或这个端口本来就不提供 HTTPS（内网服务多数是 http://）";
  }
  if (isConnectFailure(code)) {
    return "连不上这个地址，确认服务在运行、地址和网络环境都对";
  }
  return `${what}时连接中断（${code}${detail ? `：${detail}` : ""}）`;
}

/** 非 2xx 时把响应体带出来：OpenAI 协议的错误详情（无效 key、模型不存在）全在里面 */
export async function upstreamErrorOf(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  const parsed = text
    ? ((): unknown => {
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      })()
    : "";
  const detail = messageOf((parsed as { error?: unknown })?.error ?? parsed) || snippet(text);
  // 两种最常见的配置错误直接点名，省得用户对着裸状态码猜
  const hint =
    res.status === 401 || res.status === 403
      ? "（API Key 可能不对）"
      : res.status === 404
        ? "（地址可能不对，确认填到了 /v1 这一段）"
        : "";
  return `服务返回 ${res.status}${hint}${detail ? `：${snippet(detail)}` : ""}`;
}

/**
 * 取回复文本。content 多数是字符串，但部分兼容服务会给
 * `[{ type: "text", text }]` 的分段形式，两种都收。
 */
export function replyTextOf(body: unknown): string {
  const message = (body as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]
    ?.message?.content;
  if (typeof message === "string") return message.trim();
  if (Array.isArray(message)) {
    return message
      .map((part) => (typeof (part as { text?: unknown })?.text === "string" ? part.text : ""))
      .join("")
      .trim();
  }
  return "";
}
