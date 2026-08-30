import { z } from "zod";

/**
 * 画布图数据。整张图序列化成一个 JSON 存进 projects.graph。
 *
 * 只保留重建画布必需的字段：React Flow 运行时还会往节点上挂
 * selected / dragging / measured 等瞬时状态，那些不落盘，
 * 否则刷新后会带着上次的选中态回来，payload 也会白白变大。
 */
export const canvasNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().optional(),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.object({ label: z.string() }).catchall(z.unknown()),
});

export const canvasEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().nullish(),
  targetHandle: z.string().nullish(),
  type: z.string().optional(),
});

export const viewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number().positive(),
});

export const projectGraphSchema = z.object({
  // 上限是防御性的：画布是整体覆盖写，没有上限时一次异常请求就能塞爆单元格
  nodes: z.array(canvasNodeSchema).max(500),
  edges: z.array(canvasEdgeSchema).max(1000),
  viewport: viewportSchema,
});

export type CanvasNode = z.infer<typeof canvasNodeSchema>;
export type CanvasEdge = z.infer<typeof canvasEdgeSchema>;
export type ProjectGraph = z.infer<typeof projectGraphSchema>;

/** 新项目的初始图，也是 DB 列的默认值 */
export const EMPTY_GRAPH: ProjectGraph = {
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
};

export const EMPTY_GRAPH_JSON = JSON.stringify(EMPTY_GRAPH);
