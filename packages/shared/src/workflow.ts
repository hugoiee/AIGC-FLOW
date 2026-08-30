import { z } from "zod";

/**
 * 工作流：画布的顶层容器，一个工作流对应一张节点画布。
 * 节点 / 连线结构留到画布功能迭代时再补，这里只落最小可用字段。
 */
export const workflowSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createWorkflowSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(""),
});

export type Workflow = z.infer<typeof workflowSchema>;
export type CreateWorkflowInput = z.input<typeof createWorkflowSchema>;
