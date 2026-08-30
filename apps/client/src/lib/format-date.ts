const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * 把 ISO 8601 UTC 时间戳格式化成相对时间。
 * 超过 30 天回落到绝对日期，避免出现「412 天前」这种读不出信息的文案。
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return "未知时间";

  const diff = now.getTime() - target.getTime();
  if (diff < 0) return "刚刚";
  if (diff < MINUTE) return "刚刚";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)} 天前`;

  return target.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
}
