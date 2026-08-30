import { createProjectSchema } from "@aigc-flow/shared";
import { zValidator } from "@hono/zod-validator";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { projects } from "../db/schema";

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const projectsRoute = new Hono()
  .get("/", (c) => {
    // 最近更新的排在前面；同一秒内创建的多条用 id 兜底保证顺序稳定
    const rows = db
      .select()
      .from(projects)
      .orderBy(desc(projects.updatedAt), desc(projects.id))
      .all();
    return c.json(rows);
  })
  .post("/", zValidator("json", createProjectSchema), (c) => {
    const input = c.req.valid("json");
    const row = db.insert(projects).values({ name: input.name }).returning().get();
    return c.json(row, 201);
  })
  .get("/:id", zValidator("param", idParamSchema), (c) => {
    const { id } = c.req.valid("param");
    const row = db.select().from(projects).where(eq(projects.id, id)).get();
    if (!row) return c.json({ message: "项目不存在" }, 404);
    return c.json(row);
  })
  .delete("/:id", zValidator("param", idParamSchema), (c) => {
    const { id } = c.req.valid("param");
    const row = db.delete(projects).where(eq(projects.id, id)).returning().get();
    if (!row) return c.json({ message: "项目不存在" }, 404);
    return c.json({ id: row.id });
  });
