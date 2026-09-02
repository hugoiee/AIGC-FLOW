import { MEDIA_KINDS, type MediaKind } from "./media";
import { promptTokenOf } from "./prompt-token";

/**
 * prompt 里用 @ 引用参考素材的占位 token。存进 graph JSON，是数据契约的一部分：
 * 生成节点的 prompt 形如 "让 {{image:<节点id>}} 里的猫跟着 {{audio:<节点id>}} 跳舞"，
 * 输入框把 token 渲染成按种类配色的徽章（悬停出预览），发请求前用 resolveMediaRefs
 * 换成模型认的占位符。只能引用已经连入本节点的素材（它们才在对应的 *_list 里）。
 */
export function mediaTokenOf(kind: MediaKind, nodeId: string): string {
  return promptTokenOf(kind, nodeId);
}

/** 匹配所有素材 token；捕获组 1 是种类、组 2 是节点 id */
export const MEDIA_TOKEN_RE = /\{\{(image|video|audio):([0-9a-zA-Z-]+)\}\}/g;

/** 同上，连同前导空格（组 1 空格、组 2 种类、组 3 节点 id）；引用失效时整段清掉用 */
const MEDIA_TOKEN_WITH_SPACE_RE = /([ \t]*)\{\{(image|video|audio):([0-9a-zA-Z-]+)\}\}/g;

/**
 * 模型认的素材占位符：序号就是这份素材在对应列表（image_list / video_list /
 * audio_list）里的位置（从 1 数起）。列表保持连线顺序不动，引用只是告诉模型
 * 「用列表里的第几个」，所以同一份素材引用几次列表里都只有一份。
 * 内网联调后若格式有出入，改这一处。
 */
export function mediaPlaceholderOf(kind: MediaKind, index: number): string {
  return `<<<${kind}${index}>>>`;
}

export type MediaRefSource = { id: string; url: string };

/** 三个列表，必须是**实际发出去的** image_list / video_list / audio_list */
export type MediaRefLists = Record<MediaKind, readonly MediaRefSource[]>;

/**
 * 发请求前处理 prompt 里的素材引用。lists 必须是实际发出去的三个列表
 * （已就绪、已按上限截断），占位符的序号按各自列表的下标算：
 * - 引用了列表里素材的 token 换成带序号的占位符
 * - 引用的素材不在列表里（断线、还没上传完、超出上限）的 token 直接移除，连同前导空格
 */
export function resolveMediaRefs(prompt: string, lists: MediaRefLists): string {
  const indexOf = new Map<string, number>();
  for (const kind of MEDIA_KINDS) {
    lists[kind].forEach((item, index) => {
      indexOf.set(`${kind}:${item.id}`, index + 1);
    });
  }
  return prompt
    .replace(MEDIA_TOKEN_WITH_SPACE_RE, (_, space: string, kind: MediaKind, id: string) => {
      const index = indexOf.get(`${kind}:${id}`);
      return index === undefined ? "" : space + mediaPlaceholderOf(kind, index);
    })
    .trim();
}
