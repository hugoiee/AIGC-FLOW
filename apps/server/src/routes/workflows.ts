import { createWorkflowSchema } from "@aigc-flow/shared";
import { zValidator } from "@hono/zod-validator";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { workflows } from "../db/schema";

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const workflowsRoute = new Hono()
  .get("/", (c) => {
    const rows = db.select().from(workflows).orderBy(desc(workflows.id)).all();
    return c.json(rows);
  })
  .post("/", zValidator("json", createWorkflowSchema), (c) => {
    const input = c.req.valid("json");
    const row = db.insert(workflows).values(input).returning().get();
    return c.json(row, 201);
  })
  .get("/:id", zValidator("param", idParamSchema), (c) => {
    const { id } = c.req.valid("param");
    const row = db.select().from(workflows).where(eq(workflows.id, id)).get();
    if (!row) return c.json({ message: "工作流不存在" }, 404);
    return c.json(row);
  })
  .delete("/:id", zValidator("param", idParamSchema), (c) => {
    const { id } = c.req.valid("param");
    const row = db.delete(workflows).where(eq(workflows.id, id)).returning().get();
    if (!row) return c.json({ message: "工作流不存在" }, 404);
    return c.json({ id: row.id });
  });
