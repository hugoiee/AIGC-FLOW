import { desc } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";
import { generations } from "../db/schema";

/** 列表只回最近这么多条；统计始终是全量聚合，不受列表截断影响 */
const LIST_LIMIT = 200;

export const generationsRoute = new Hono().get("/", (c) => {
  const items = db.select().from(generations).orderBy(desc(generations.id)).limit(LIST_LIMIT).all();

  const all = db
    .select({
      kind: generations.kind,
      status: generations.status,
      durationSeconds: generations.durationSeconds,
    })
    .from(generations)
    .all();

  const stats = {
    imageTotal: 0,
    imageSuccess: 0,
    videoTotal: 0,
    videoSuccess: 0,
    /** 成功视频的请求时长合计（秒）；「自动」时长的不计入，单独计数 */
    videoSeconds: 0,
    videoAutoCount: 0,
  };
  for (const row of all) {
    if (row.kind === "image") {
      stats.imageTotal += 1;
      if (row.status === "success") stats.imageSuccess += 1;
      continue;
    }
    stats.videoTotal += 1;
    if (row.status !== "success") continue;
    stats.videoSuccess += 1;
    if (row.durationSeconds != null && row.durationSeconds > 0) {
      stats.videoSeconds += row.durationSeconds;
    } else {
      stats.videoAutoCount += 1;
    }
  }

  return c.json({ stats, items });
});
