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
