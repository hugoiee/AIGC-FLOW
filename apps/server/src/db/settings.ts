import { DEFAULT_UPLOAD_BASE_URL } from "@aigc-flow/shared";
import { eq } from "drizzle-orm";
import { db } from "./index";
import { settings } from "./schema";

const UPLOAD_BASE_URL_KEY = "upload_base_url";

/** 和 schema.ts 的 isoNow 同格式（带 Z 的 ISO 8601 UTC） */
function nowIso(): string {
  return `${new Date().toISOString().slice(0, 19)}Z`;
}

/** 内网上传服务根地址。没配置过时退回接口文档里的默认地址 */
export function getUploadBaseUrl(): string {
  const row = db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, UPLOAD_BASE_URL_KEY))
    .get();
  return row?.value ?? DEFAULT_UPLOAD_BASE_URL;
}

export function setUploadBaseUrl(value: string): void {
  db.insert(settings)
    .values({ key: UPLOAD_BASE_URL_KEY, value, updatedAt: nowIso() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: nowIso() },
    })
    .run();
}
