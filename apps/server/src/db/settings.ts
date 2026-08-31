import { type AppSettings, DEFAULT_APP_SETTINGS } from "@aigc-flow/shared";
import { db } from "./index";
import { settings } from "./schema";

/** AppSettings 字段 → settings 表 key 的映射，新增设置项在这里登记 */
const SETTING_KEYS: Record<keyof AppSettings, string> = {
  uploadBaseUrl: "upload_base_url",
  generateBaseUrl: "generate_base_url",
  reqFrom: "req_from",
};

/** 和 schema.ts 的 isoNow 同格式（带 Z 的 ISO 8601 UTC） */
function nowIso(): string {
  return `${new Date().toISOString().slice(0, 19)}Z`;
}

/** 全部设置。没配置过的项退回默认值 */
export function getAppSettings(): AppSettings {
  const rows = db.select({ key: settings.key, value: settings.value }).from(settings).all();
  const stored = new Map(rows.map((row) => [row.key, row.value]));

  const result = { ...DEFAULT_APP_SETTINGS };
  for (const field of Object.keys(SETTING_KEYS) as (keyof AppSettings)[]) {
    const value = stored.get(SETTING_KEYS[field]);
    if (value !== undefined) result[field] = value;
  }
  return result;
}

export function setAppSettings(value: AppSettings): void {
  for (const field of Object.keys(SETTING_KEYS) as (keyof AppSettings)[]) {
    db.insert(settings)
      .values({ key: SETTING_KEYS[field], value: value[field], updatedAt: nowIso() })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: value[field], updatedAt: nowIso() },
      })
      .run();
  }
}
