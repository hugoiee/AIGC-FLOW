import {
  IMAGE_GEN_NODE_TYPE,
  MEDIA_NODE_TYPE,
  type MediaNodeData,
  TEXT_NODE_TYPE,
  VIDEO_GEN_NODE_TYPE,
} from "@aigc-flow/shared";
import type { Node } from "@xyflow/react";

/** 连线语义里的资源种类。生成节点的产出也算对应种类的资源 */
export type ResourceKind = "image" | "video" | "audio" | "text";

/** 一个节点作为连线起点时输出什么资源；不能往外连的返回 null */
export function sourceResourceOf(node: Pick<Node, "type" | "data">): ResourceKind | null {
  if (node.type === MEDIA_NODE_TYPE) return (node.data as unknown as MediaNodeData).kind;
  if (node.type === IMAGE_GEN_NODE_TYPE) return "image";
  if (node.type === VIDEO_GEN_NODE_TYPE) return "video";
  if (node.type === TEXT_NODE_TYPE) return "text";
  return null;
}

/** 一个节点作为连线目标时接受哪些资源；不能被连的返回 null */
export function targetAcceptsOf(nodeType: string | undefined): ReadonlySet<ResourceKind> | null {
  if (nodeType === IMAGE_GEN_NODE_TYPE) return IMAGE_ACCEPTS;
  if (nodeType === VIDEO_GEN_NODE_TYPE) return VIDEO_ACCEPTS;
  return null;
}

const IMAGE_ACCEPTS: ReadonlySet<ResourceKind> = new Set(["image", "text"]);
const VIDEO_ACCEPTS: ReadonlySet<ResourceKind> = new Set(["image", "video", "audio", "text"]);

/** source → target 这条连线是否合法 */
export function canConnectNodes(
  source: Pick<Node, "type" | "data">,
  target: Pick<Node, "type">,
): boolean {
  const resource = sourceResourceOf(source);
  if (!resource) return false;
  return targetAcceptsOf(target.type)?.has(resource) ?? false;
}
