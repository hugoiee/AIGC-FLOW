import { createProjectSchema, EMPTY_GRAPH, projectGraphSchema } from "@aigc-flow/shared";
import { zValidator } from "@hono/zod-validator";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { projects } from "../db/schema";

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/** 项目的“元信息”列。graph 单独走 /:id/graph，不混在这些接口里 */
const projectColumns = {
  id: projects.id,
  name: projects.name,
  coverImage: projects.coverImage,
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
};

/**
 * SQLite 不会自动维护 updated_at，update 时必须显式写。
 * 格式要和 schema.ts 里的 isoNow 一致（带 Z 的 ISO 8601 UTC）。
 */
function nowIso(): string {
  return `${new Date().toISOString().slice(0, 19)}Z`;
}

export const projectsRoute = new Hono()
  .get("/", (c) => {
    // 最近更新的排在前面；同一秒内创建的多条用 id 兜底保证顺序稳定
    // 不含 graph：列表页用不上，整图 JSON 会白白撑大响应
    const rows = db
      .select(projectColumns)
      .from(projects)
      .orderBy(desc(projects.updatedAt), desc(projects.id))
      .all();
    return c.json(rows);
  })
  .post("/", zValidator("json", createProjectSchema), (c) => {
    const input = c.req.valid("json");
    const row = db.insert(projects).values({ name: input.name }).returning(projectColumns).get();
    return c.json(row, 201);
  })
  .get("/:id", zValidator("param", idParamSchema), (c) => {
    const { id } = c.req.valid("param");
    const row = db.select(projectColumns).from(projects).where(eq(projects.id, id)).get();
    if (!row) return c.json({ message: "项目不存在" }, 404);
    return c.json(row);
  })
  .delete("/:id", zValidator("param", idParamSchema), (c) => {
    const { id } = c.req.valid("param");
    const row = db.delete(projects).where(eq(projects.id, id)).returning({ id: projects.id }).get();
    if (!row) return c.json({ message: "项目不存在" }, 404);
    return c.json({ id: row.id });
  })
  .get("/:id/graph", zValidator("param", idParamSchema), (c) => {
    const { id } = c.req.valid("param");
    const row = db
      .select({ graph: projects.graph })
      .from(projects)
      .where(eq(projects.id, id))
      .get();
    if (!row) return c.json({ message: "项目不存在" }, 404);

    // 落盘的是自由文本，脏数据不能让整个画布打不开：解析失败就退回空图
    const parsed = projectGraphSchema.safeParse(safeJsonParse(row.graph));
    if (!parsed.success) {
      console.warn(`[graph] 项目 ${id} 的图数据无法解析，已回退为空图`);
      return c.json(EMPTY_GRAPH);
    }
    return c.json(parsed.data);
  })
  .put(
    "/:id/graph",
    zValidator("param", idParamSchema),
    zValidator("json", projectGraphSchema),
    (c) => {
      const { id } = c.req.valid("param");
      const graph = c.req.valid("json");

      const row = db
        .update(projects)
        .set({ graph: JSON.stringify(graph), updatedAt: nowIso() })
        .where(eq(projects.id, id))
        .returning({ id: projects.id, updatedAt: projects.updatedAt })
        .get();
      if (!row) return c.json({ message: "项目不存在" }, 404);

      return c.json(row);
    },
  );

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
