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
 * 模型认的图片占位符。图片在请求里是按 image_list 顺序排的队列，
 * prompt 里每个占位符按出现顺序对应队列里的一张 —— 所以 resolveImageRefs
 * 会把被引用的图按徽章出现顺序排到 image_list 前面。
 * 内网联调后如果要改成带序号的形式（比如 <<<image1>>>），
 * 改这里的 placeholderOf 一处即可，index 从 1 数起。
 */
export const IMAGE_REF_PLACEHOLDER = "<<<image>>>";

function placeholderOf(_index: number): string {
  return IMAGE_REF_PLACEHOLDER;
}

export type ImageRefSource = { id: string; url: string };

export type ResolvedImageRefs = {
  /** token 已换成占位符的 prompt */
  prompt: string;
  /** 发请求用的 image_list：先是徽章按出现顺序引用的图，再补上没被引用的连入图 */
  imageUrls: string[];
};

/**
 * 发请求前处理 prompt 里的图片引用：
 * - 引用了已连入图片的 token 换成占位符，并把这张图按引用顺序排进队列
 *   （同一张图引用两次就在队列里出现两次，位置语义要求一一对应）
 * - 引用的图已经不在（断线、还没上传完）的 token 直接移除
 * - 没被引用的连入图按原顺序追加到队列末尾，不引用也照样是参考图
 */
export function resolveImageRefs(
  prompt: string,
  images: readonly ImageRefSource[],
): ResolvedImageRefs {
  const urlById = new Map(images.map((image) => [image.id, image.url]));
  const referenced: string[] = [];
  const referencedIds = new Set<string>();

  const resolved = prompt
    .replace(IMAGE_TOKEN_WITH_SPACE_RE, (_, space: string, id: string) => {
      const url = urlById.get(id);
      if (url === undefined) return "";
      referenced.push(url);
      referencedIds.add(id);
      return space + placeholderOf(referenced.length);
    })
    .trim();

  const rest = images.filter((image) => !referencedIds.has(image.id)).map((image) => image.url);

  return { prompt: resolved, imageUrls: [...referenced, ...rest] };
}
