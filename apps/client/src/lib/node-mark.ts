import type { NodeMark } from "@aigc-flow/shared";
import type { Node } from "@xyflow/react";
import { nodeMediaOf } from "@/lib/node-media";

/**
 * 节点身上的标记。只有素材类节点（媒体 / 图像生成 / 视频生成）有这个字段，
 * 其他节点和没打过标的返回 null。
 */
export function nodeMarkOf(node: { type?: string; data: unknown }): NodeMark | null {
  const mark = (node.data as { mark?: unknown }).mark;
  return mark === "keep" || mark === "reject" ? mark : null;
}

/**
 * 一批节点里真正能打标的：身上有素材的那些（判断走 nodeMediaOf，和批量下载同一份）。
 * 还没上传完 / 还没生成出结果的没有东西可评，文本和编组本来就不是素材。
 */
export function markableIds(nodes: Node[], ids: string[]): string[] {
  const wanted = new Set(ids);
  return nodes.filter((node) => wanted.has(node.id) && nodeMediaOf(node) !== null).map((n) => n.id);
}

/**
 * 给一批节点打标（null 为清除）。纯函数：只改真正需要变的节点，
 * 一个都没变时返回原数组，调用方据此跳过入历史栈。
 */
export function markNodes(nodes: Node[], ids: string[], mark: NodeMark | null): Node[] {
  const targets = new Set(markableIds(nodes, ids));
  let changed = false;
  const next = nodes.map((node) => {
    if (!targets.has(node.id) || nodeMarkOf(node) === mark) return node;
    changed = true;
    return { ...node, data: { ...node.data, mark: mark ?? undefined } };
  });
  return changed ? next : nodes;
}

/** 三态各有多少：keep / reject 是打过标的，unmarked 是有素材但还没审的 */
export type MarkSummary = { keep: number; reject: number; unmarked: number };

/** 只数身上有素材的节点，和 markableIds 同一判据 */
export function markSummary(nodes: Node[]): MarkSummary {
  const summary: MarkSummary = { keep: 0, reject: 0, unmarked: 0 };
  for (const node of nodes) {
    if (nodeMediaOf(node) === null) continue;
    summary[nodeMarkOf(node) ?? "unmarked"] += 1;
  }
  return summary;
}

/** 某一态的全部素材节点 id（null 是待审）。左上角计数芯片点击选中用 */
export function idsByMark(nodes: Node[], mark: NodeMark | null): string[] {
  return nodes
    .filter((node) => nodeMediaOf(node) !== null && nodeMarkOf(node) === mark)
    .map((node) => node.id);
}
