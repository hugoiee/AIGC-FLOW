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
