import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";

export const healthRoute = new Hono().get("/", (c) => {
  // 顺带探一次 SQLite，确保「服务活着」等价于「数据库也活着」
  const probe = db.get<{ ok: number }>(sql`select 1 as ok`);

  return c.json({
    status: "ok" as const,
    db: probe?.ok === 1 ? ("ok" as const) : ("down" as const),
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});
