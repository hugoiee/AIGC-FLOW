import { z } from "zod";

/** 文本节点在 React Flow 里的 node.type */
export const TEXT_NODE_TYPE = "text";

export const textNodeDataSchema = z.object({
  label: z.string(),
  /** 文本内容，连给生成节点时按 prompt 里徽章的位置插入 */
  text: z.string(),
});

export type TextNodeData = z.infer<typeof textNodeDataSchema>;

export const DEFAULT_TEXT_NODE_DATA: TextNodeData = {
  label: "文本",
  text: "",
};

/** 文本节点的初始尺寸，之后可在画布上自由拉伸（尺寸会落盘） */
export const TEXT_NODE_WIDTH = 320;
export const TEXT_NODE_HEIGHT = 140;

/**
 * prompt 里的文本节点占位 token。存进 graph JSON，是数据契约的一部分：
 * 生成节点的 prompt 形如 "美人鱼唱歌 {{text:<节点id>}} 黄昏光线"，
 * 输入框把 token 渲染成徽章，发请求前用 resolvePromptText 换回文本内容。
 */
export function textTokenOf(nodeId: string): string {
  return `{{text:${nodeId}}}`;
}

/** 匹配所有 token；捕获组 1 是节点 id。split 场景用它的带括号形态保留分隔项 */
export const TEXT_TOKEN_RE = /\{\{text:([0-9a-zA-Z-]+)\}\}/g;

/** 同上，但把 token 前面的空格也吃进来（捕获组 1 空格、组 2 节点 id）。
    清掉 token 时用它，避免「美人鱼 {{token}} 黄昏」删完剩下两个空格 */
const TEXT_TOKEN_WITH_SPACE_RE = /([ \t]*)\{\{text:([0-9a-zA-Z-]+)\}\}/g;

/**
 * 连线变化时同步 prompt 里的 token：
 * - 新连上的文本节点（added）在末尾追加徽章（已有就不重复加）
 * - 断线的（removed）把徽章从文中移除
 * 用户手动删掉徽章但连线还在的情况不动 —— 位置语义以徽章为准，
 * 想重新插入就断线重连（会重新追加到末尾）。
 */
export function syncPromptTokens(prompt: string, added: string[], removed: string[]): string {
  let next = prompt;

  for (const id of removed) {
    next = next.split(textTokenOf(id)).join("");
  }

  for (const id of added) {
    const token = textTokenOf(id);
    if (next.includes(token)) continue;
    next =
      next === "" || next.endsWith(" ") || next.endsWith("\n") ? next + token : `${next} ${token}`;
  }

  return next;
}

/**
 * 复制粘贴时重写 prompt 里的 token。
 * 源文本节点跟着一起粘的换成它的新 id；没跟着粘的直接清掉 ——
 * 连线只在两端都被复制时才会带过来，留着这种 token 只会得到一个
 * 连不到任何东西的空徽章，发请求时也会被 resolvePromptText 丢掉。
 * 清 token 时连它前面的空格一起去掉，免得原地留下双空格。
 */
export function remapPromptTokens(prompt: string, idMap: ReadonlyMap<string, string>): string {
  return prompt
    .replace(TEXT_TOKEN_WITH_SPACE_RE, (_, space: string, id: string) => {
      const mapped = idMap.get(id);
      return mapped ? space + textTokenOf(mapped) : "";
    })
    .trim();
}

/** 发请求前把 token 换成对应文本节点的内容；没有对应内容的 token 直接移除 */
export function resolvePromptText(prompt: string, textById: Map<string, string>): string {
  return prompt.replace(TEXT_TOKEN_RE, (_, id: string) => textById.get(id) ?? "").trim();
}
