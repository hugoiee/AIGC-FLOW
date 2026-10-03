import { z } from "zod";
import { canvasEdgeSchema, canvasNodeSchema } from "./graph";

/**
 * 跨项目复制粘贴的剪贴板载荷。
 *
 * 存在浏览器 localStorage 里（单槽，复制一次覆盖一次），所以它是**会跨版本存活**的
 * 数据：用户上周复制的内容，这周更新完前端还躺在那儿。因此和 projects.graph 一样
 * 当契约对待 —— 节点 / 连线直接复用图数据那两个 schema，读出来一律先过校验，
 * 版本对不上或字段缺失就当剪贴板是空的（见 lib/clipboard.ts），不能让画布崩。
 *
 * 改结构时必须把 CLIPBOARD_VERSION 加一，让旧载荷自然失效。
 */
export const CLIPBOARD_VERSION = 1;

export const canvasClipboardSchema = z.object({
  version: z.literal(CLIPBOARD_VERSION),
  /** 复制来源，用来区分「同项目粘贴」和「跨项目粘贴」：两者落点规则不同 */
  sourceProjectId: z.number().int().positive(),
  /** 来源项目名，只用于跨项目粘贴时的提示文案 */
  sourceProjectName: z.string(),
  copiedAt: z.string(),
  // 上限和 projectGraphSchema 保持一致：一次能复制的不该超过一整张画布装得下的量
  nodes: z.array(canvasNodeSchema).min(1).max(500),
  edges: z.array(canvasEdgeSchema).max(1000),
});

export type CanvasClipboard = z.infer<typeof canvasClipboardSchema>;
