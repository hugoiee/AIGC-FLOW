import { EMPTY_GRAPH_JSON } from "@aigc-flow/shared";
import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * 时间戳统一存 ISO 8601 UTC（带 Z）。
 * 不能用 CURRENT_TIMESTAMP —— 它产出 "2026-08-30 03:16:28" 这种无时区标记的格式，
 * JS 的 new Date() 会按本地时区解析，导致前端显示的时间整体偏移。
 */
const isoNow = sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`;

/** 项目：一条记录对应一张节点画布 */
export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  /** 封面图路径，当前版本恒为 null，前端按名称生成占位图 */
  coverImage: text("cover_image"),
  /** 整张画布图（nodes / edges / viewport）的 JSON，读写都是整体覆盖 */
  graph: text("graph").notNull().default(EMPTY_GRAPH_JSON),
  createdAt: text("created_at").notNull().default(isoNow),
  updatedAt: text("updated_at").notNull().default(isoNow),
});

export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;

/** 全局设置，KV 结构。目前只有一个 key：upload_base_url（内网上传服务根地址） */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(isoNow),
});

export type SettingRow = typeof settings.$inferSelect;
