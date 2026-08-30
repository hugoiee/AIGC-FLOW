import { z } from "zod";

/**
 * 项目：一个项目对应一张节点画布。
 * 节点 / 连线结构留到画布功能迭代时再补，这里只落首页列表需要的字段。
 */
export const projectSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(100),
  /** 封面图路径。当前版本不做上传，一律为 null，前端按名称生成占位图 */
  coverImage: z.string().nullable(),
  /** ISO 8601 UTC，形如 2026-08-30T03:16:28Z */
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createProjectSchema = z.object({
  // 先 trim 再校验，否则全空格的名称能通过 min(1)
  name: z.string().trim().min(1, "项目名称不能为空").max(100, "项目名称最多 100 个字符"),
});

/** 改名。字段和创建时同规则，独立成一个 schema 是为了以后能加别的可改字段 */
export const updateProjectSchema = z.object({
  name: z.string().trim().min(1, "项目名称不能为空").max(100, "项目名称最多 100 个字符"),
});

export type Project = z.infer<typeof projectSchema>;
export type UpdateProjectInput = z.input<typeof updateProjectSchema>;
export type CreateProjectInput = z.input<typeof createProjectSchema>;
