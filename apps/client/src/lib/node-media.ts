import {
  IMAGE_GEN_NODE_TYPE,
  type ImageGenNodeData,
  MEDIA_NODE_TYPE,
  type MediaKind,
  type MediaNodeData,
  VIDEO_GEN_NODE_TYPE,
  type VideoGenNodeData,
} from "@aigc-flow/shared";

/** id 是节点 id：同一份素材可以被引用多次，React key 必须用它而不是 url */
export type NodeMedia = { id: string; kind: MediaKind; url: string };

/**
 * 取出一个节点身上可用的素材 —— 上传的媒体，或生成节点已经出结果的产出。
 * 还在上传 / 还没生成 / 本来就不带文件（文本、编组）的返回 null。
 *
 * 参考图列表和批量下载都走这一份。这个判断以前散在各处，
 * 批量下载那份只认媒体节点，生成的图和视频一直下不下来。
 */
export function nodeMediaOf(node: { id: string; type?: string; data: unknown }): NodeMedia | null {
  if (node.type === MEDIA_NODE_TYPE) {
    const media = node.data as MediaNodeData;
    return media.status === "ready" && media.url
      ? { id: node.id, kind: media.kind, url: media.url }
      : null;
  }

  if (node.type === IMAGE_GEN_NODE_TYPE) {
    const gen = node.data as ImageGenNodeData;
    return gen.status === "ready" && gen.resultUrl
      ? { id: node.id, kind: "image", url: gen.resultUrl }
      : null;
  }

  if (node.type === VIDEO_GEN_NODE_TYPE) {
    const gen = node.data as VideoGenNodeData;
    return gen.status === "ready" && gen.resultUrl
      ? { id: node.id, kind: "video", url: gen.resultUrl }
      : null;
  }

  return null;
}
