/**
 * 生成节点 prompt 里的徽章 token 通用部分。两种徽章共用一套语法：
 * - `{{text:<节点id>}}`  连入的文本节点，发请求时换成文本内容（text-node.ts）
 * - `{{image:<节点id>}}` 用 @ 引用的参考图，发请求时换成模型认的占位符（image-ref.ts）
 * 这里放的是不区分种类的操作：复制粘贴时重写 id、按种类批量移除。
 */

export const PROMPT_TOKEN_KINDS = ["text", "image"] as const;
export type PromptTokenKind = (typeof PROMPT_TOKEN_KINDS)[number];

export function promptTokenOf(kind: PromptTokenKind, nodeId: string): string {
  return `{{${kind}:${nodeId}}}`;
}

/** 匹配任一种 token；捕获组 1 是种类、组 2 是节点 id。编辑器按它切分文本和徽章 */
export const PROMPT_TOKEN_RE = /\{\{(text|image):([0-9a-zA-Z-]+)\}\}/g;

/** 同上，但把 token 前面的空格也吃进来（组 1 空格、组 2 种类、组 3 节点 id）。
    清掉 token 时用它，避免「美人鱼 {{token}} 黄昏」删完剩下两个空格 */
export const PROMPT_TOKEN_WITH_SPACE_RE = /([ \t]*)\{\{(text|image):([0-9a-zA-Z-]+)\}\}/g;

/**
 * 复制粘贴时重写 prompt 里的 token。
 * 源节点跟着一起粘的换成它的新 id；没跟着粘的直接清掉 ——
 * 连线只在两端都被复制时才会带过来，留着这种 token 只会得到一个
 * 连不到任何东西的空徽章，发请求时也会被丢掉。
 * 清 token 时连它前面的空格一起去掉，免得原地留下双空格。
 */
export function remapPromptTokens(prompt: string, idMap: ReadonlyMap<string, string>): string {
  return prompt
    .replace(PROMPT_TOKEN_WITH_SPACE_RE, (_, space: string, kind: PromptTokenKind, id: string) => {
      const mapped = idMap.get(id);
      return mapped ? space + promptTokenOf(kind, mapped) : "";
    })
    .trim();
}

/** 把指定种类、指定节点的 token 从 prompt 里移除（断线时用）。前导空格一并去掉 */
export function removePromptTokens(
  prompt: string,
  kind: PromptTokenKind,
  ids: readonly string[],
): string {
  if (ids.length === 0) return prompt;
  return prompt.replace(
    PROMPT_TOKEN_WITH_SPACE_RE,
    (match, _space: string, tokenKind: PromptTokenKind, id: string) =>
      tokenKind === kind && ids.includes(id) ? "" : match,
  );
}
