import { promptTokenOf } from "./prompt-token";

/**
 * prompt 里用 @ 引用参考图的占位 token。存进 graph JSON，是数据契约的一部分：
 * 生成节点的 prompt 形如 "让 {{image:<节点id>}} 里的猫坐到沙发上"，
 * 输入框把 token 渲染成带缩略图悬停的徽章，发请求前用 resolveImageRefs 换成
 * 模型认的占位符。只能引用已经连入本节点的图片（它们才在 image_list 里）。
 */
export function imageTokenOf(nodeId: string): string {
  return promptTokenOf("image", nodeId);
}

/** 匹配所有图片 token；捕获组 1 是节点 id */
export const IMAGE_TOKEN_RE = /\{\{image:([0-9a-zA-Z-]+)\}\}/g;

/** 同上，连同前导空格（组 1 空格、组 2 节点 id）；引用失效时整段清掉用 */
const IMAGE_TOKEN_WITH_SPACE_RE = /([ \t]*)\{\{image:([0-9a-zA-Z-]+)\}\}/g;

/**
 * 模型认的图片占位符：序号就是这张图在 image_list 里的位置（从 1 数起）。
 * image_list 保持连线顺序不动，引用只是告诉模型「用列表里的第几张」，
 * 所以同一张图引用几次列表里都只有一张。内网联调后若格式有出入，改这一处。
 */
export function imagePlaceholderOf(index: number): string {
  return `<<<image${index}>>>`;
}

export type ImageRefSource = { id: string; url: string };

/**
 * 发请求前处理 prompt 里的图片引用。images 必须是**实际发出去的 image_list**
 * （已就绪、已按上限截断），占位符的序号按它的下标算：
 * - 引用了列表里图片的 token 换成带序号的占位符
 * - 引用的图不在列表里（断线、还没上传完、超出上限）的 token 直接移除，连同前导空格
 */
export function resolveImageRefs(prompt: string, images: readonly ImageRefSource[]): string {
  const indexById = new Map(images.map((image, index) => [image.id, index + 1]));
  return prompt
    .replace(IMAGE_TOKEN_WITH_SPACE_RE, (_, space: string, id: string) => {
      const index = indexById.get(id);
      return index === undefined ? "" : space + imagePlaceholderOf(index);
    })
    .trim();
}
