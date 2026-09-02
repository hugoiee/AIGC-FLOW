import { zValidator } from "@hono/zod-validator";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { generations } from "../db/schema";

/** 列表只回最近这么多条；统计始终是全量聚合，不受列表截断影响 */
const LIST_LIMIT = 200;

/**
 * 带 projectId 只看该项目（画布）的流水，成本按项目核算；
 * 不带就是全局口径，含加项目列之前的老记录和已删项目留下的记录。
 */
const listQuerySchema = z.object({
  projectId: z.coerce.number().int().positive().optional(),
});

export const generationsRoute = new Hono().get("/", zValidator("query", listQuerySchema), (c) => {
  const { projectId } = c.req.valid("query");
  const scope = projectId === undefined ? undefined : eq(generations.projectId, projectId);

  const items = db
    .select()
    .from(generations)
    .where(scope)
    .orderBy(desc(generations.id))
    .limit(LIST_LIMIT)
    .all();

  const all = db
    .select({
      kind: generations.kind,
      status: generations.status,
      durationSeconds: generations.durationSeconds,
    })
    .from(generations)
    .where(scope)
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
