/**
 * 内网接口（上传 / 生成）响应的共用解析。
 * 这些接口失败时的返回形状不统一，有的给 message、有的给 msg，
 * 还有的干脆 200 带个空结果，所以线索只能从响应体里挖。
 */

/** 内网返回体里挑一句人能读的话，挑不到返回空串 */
export function messageOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  for (const key of ["message", "msg", "error", "detail", "reason"]) {
    const field = record[key];
    if (typeof field === "string" && field) return field;
  }
  return "";
}

/**
 * 响应体截断成一行，日志和给用户的报错都走它。
 * 内网偶尔会返回整页 HTML，原样塞进 toast 没法看。
 */
export function snippet(text: string, max = 300): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/**
 * 建连阶段的错误码：只有这些才是真的「连不上」，其余都是连上以后出的事。
 * 分清两者很重要 —— 把「等待中断」也报成「连不上」，用户会一直去查网络和地址。
 */
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
export function fetchFailureOf(error: unknown): { code: string; detail: string } {
  const cause = (error as { cause?: unknown })?.cause;
  const source = (cause ?? error) as { code?: unknown; message?: unknown } | null;
  const code = typeof source?.code === "string" ? source.code : "";
  const detail = typeof source?.message === "string" ? source.message : String(source ?? error);
  return { code, detail: snippet(detail) };
}

/**
 * TLS 握手还没完成对端就断开了。Node 给的 code 是 ECONNRESET，
 * 光看 code 会当成「连上了以后中途断」—— 但它其实发生在**建连阶段**，
 * 两者的排查方向完全相反。判据只能是这句话本身。
 */
export function isTlsHandshakeFailure(code: string, detail: string): boolean {
  return code === "ECONNRESET" && detail.includes("before secure TLS connection was established");
}

/**
 * 没有 code 时也算「连不上」：信息不足时按最常见的原因报，比甩一句 fetch failed 强。
 * TLS 握手期间断开同样算 —— 一个字节的应用数据都没走通，不是「中途」。
 */
export function isConnectFailure(code: string, detail = ""): boolean {
  return !code || CONNECT_ERROR_CODES.has(code) || isTlsHandshakeFailure(code, detail);
}
