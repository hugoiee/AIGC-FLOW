import {
  type CanvasEdge,
  type CanvasNode,
  MEDIA_NODE_TYPE,
  type MediaNodeData,
  type ProjectGraph,
} from "@aigc-flow/shared";
import { type Edge, type Node, Position, type Viewport } from "@xyflow/react";

/**
 * 上传中 / 上传失败的媒体节点不落盘。
 * 存下来也没意义：刷新后 File 对象已经没了，既重试不了也拿不到 URL，
 * 只会留下一个永远"上传中"的死节点。
 */
function isPersistable(node: Node): boolean {
  if (node.type !== MEDIA_NODE_TYPE) return true;
  return (node.data as unknown as MediaNodeData)?.status === "ready";
}

/**
 * React Flow 会往节点上挂 selected / dragging / measured 等瞬时状态。
 * 落盘前必须剥掉：否则刷新后会带着上次的选中态回来，payload 也白白变大，
 * 而且单纯点选一个节点就会被判定为「有改动」触发保存。
 */
export function toPersistedGraph(nodes: Node[], edges: Edge[], viewport: Viewport): ProjectGraph {
  const kept = nodes.filter(isPersistable);
  const keptIds = new Set(kept.map((node) => node.id));

  return {
    nodes: kept.map(
      (node): CanvasNode => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: { label: String(node.data?.label ?? "未命名节点"), ...node.data },
        // 只落媒体节点的尺寸。普通节点的 width/height 是 React Flow 量出来的，
        // 存下来会让"内容自适应"变成"锁死在上次量到的值"
        // 锁比例拖拽会算出 632.888…/112.5 这种小数，落库前取整。
        // 放在这一处而不是 onResizeEnd：这是尺寸写出去的唯一出口，
        // 不依赖某个回调有没有被触发。
        ...(node.type === MEDIA_NODE_TYPE && node.width && node.height
          ? { width: Math.round(node.width), height: Math.round(node.height) }
          : {}),
      }),
    ),
    // 丢掉指向已被过滤节点的悬空连线，否则加载时会连到不存在的节点
    edges: edges
      .filter((edge) => keptIds.has(edge.source) && keptIds.has(edge.target))
      .map(
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
      ...(node.width && node.height
        ? {
            width: node.width,
            height: node.height,
            // style 也要给：React Flow 靠它渲染尺寸，只给 width/height 会被重新量一遍
            style: { width: node.width, height: node.height },
          }
        : {}),
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
