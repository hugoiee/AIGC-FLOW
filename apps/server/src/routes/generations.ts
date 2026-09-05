import { zValidator } from "@hono/zod-validator";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { generations, projects } from "../db/schema";

/** 列表默认只回最近这么多条；统计始终是全量聚合，不受列表截断影响 */
const LIST_LIMIT = 200;
/** 导出要的是全量明细，但仍留一个上限兜底，别让一次请求把库整个吐出来 */
const MAX_LIMIT = 5000;

/**
 * 带 projectId 只看该项目（画布）的流水，成本按项目核算；
 * 不带就是全局口径，含加项目列之前的老记录和已删项目留下的记录。
 * limit 给导出用（面板列表只要最近 200 条，导出要全量）。
 */
const listQuerySchema = z.object({
  projectId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional(),
});

export const generationsRoute = new Hono().get("/", zValidator("query", listQuerySchema), (c) => {
  const { projectId, limit } = c.req.valid("query");
  const scope = projectId === undefined ? undefined : eq(generations.projectId, projectId);

  // 全局口径下光有 project_id 看不出是哪张画布，左连出项目名；
  // 老记录和已删项目的 project_id 是 null，join 不上，前端按「未归属」显示。
  const items = db
    .select({
      id: generations.id,
      projectId: generations.projectId,
      projectName: projects.name,
      kind: generations.kind,
      payload: generations.payload,
      status: generations.status,
      error: generations.error,
      resultUrl: generations.resultUrl,
      durationSeconds: generations.durationSeconds,
      createdAt: generations.createdAt,
    })
    .from(generations)
    .leftJoin(projects, eq(generations.projectId, projects.id))
    .where(scope)
    .orderBy(desc(generations.id))
    .limit(limit ?? LIST_LIMIT)
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
