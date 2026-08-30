import type { CanvasEdge, CanvasNode, ProjectGraph } from "@aigc-flow/shared";
import { type Edge, type Node, Position, type Viewport } from "@xyflow/react";

/**
 * React Flow 会往节点上挂 selected / dragging / measured 等瞬时状态。
 * 落盘前必须剥掉：否则刷新后会带着上次的选中态回来，payload 也白白变大，
 * 而且后端的 zod schema 是严格的，多余字段会被剥离但没必要走这一遭。
 */
export function toPersistedGraph(nodes: Node[], edges: Edge[], viewport: Viewport): ProjectGraph {
  return {
    nodes: nodes.map(
      (node): CanvasNode => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: { label: String(node.data?.label ?? "未命名节点"), ...node.data },
      }),
    ),
    edges: edges.map(
      (edge): CanvasEdge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        type: edge.type,
      }),
    ),
    viewport,
  };
}

/**
 * 后端返回的图恢复成 React Flow 能吃的结构。
 * 顺手补上左右连接点：React Flow 默认端口在上下，横向流程连出来会绕一圈。
 * 这两个字段是纯展示的，不落盘。
 */
export function fromPersistedGraph(graph: ProjectGraph): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? undefined,
      targetHandle: edge.targetHandle ?? undefined,
      type: edge.type,
    })),
  };
}

/** 比较两张图是否等价，用于判断「有没有未保存的改动」 */
export function isSameGraph(a: ProjectGraph, b: ProjectGraph): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
