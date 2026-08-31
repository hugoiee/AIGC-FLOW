"use client";

import {
  resolvePromptText,
  syncPromptTokens,
  TEXT_NODE_TYPE,
  TEXT_TOKEN_RE,
  type TextNodeData,
  textTokenOf,
} from "@aigc-flow/shared";
import { useReactFlow } from "@xyflow/react";
import { type ClipboardEvent, type KeyboardEvent, useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";

/** 徽章文案：内容前几个字最有辨识度，空内容退回节点名 */
function badgeLabelOf(data: TextNodeData): string {
  const head = data.text.trim().replace(/\s+/g, " ").slice(0, 10);
  return head || data.label;
}

type UpstreamNode = { id: string; type?: string; data: Record<string, unknown> } | null;

/**
 * 生成节点的 prompt ↔ 上游文本节点的粘合逻辑：
 * - 新连上的文本节点把徽章 token 追加到 prompt 末尾，断线的移除
 *   （用户手动删掉徽章但连线还在的不动，位置语义以徽章为准，断线重连可重新插入）
 * - badges 给编辑器渲染徽章文案，resolvedPrompt 是发请求用的最终文本
 */
export function usePromptTokens(nodeId: string, prompt: string, sources: UpstreamNode[]) {
  const { updateNodeData } = useReactFlow();

  const textSources = useMemo(
    () =>
      sources.filter(
        (node): node is NonNullable<UpstreamNode> => node !== null && node.type === TEXT_NODE_TYPE,
      ),
    [sources],
  );
  const idsKey = textSources.map((node) => node.id).join(",");

  // 初始视为已同步：挂载时不把用户上次手动删掉的徽章补回来
  const prevIdsRef = useRef<string[] | null>(null);

  useEffect(() => {
    const ids = idsKey === "" ? [] : idsKey.split(",");
    const prev = prevIdsRef.current;
    prevIdsRef.current = ids;
    if (prev === null) return;

    const added = ids.filter((id) => !prev.includes(id));
    const removed = prev.filter((id) => !ids.includes(id));
    if (added.length === 0 && removed.length === 0) return;

    const synced = syncPromptTokens(prompt, added, removed);
    if (synced !== prompt) updateNodeData(nodeId, { prompt: synced });
  }, [idsKey, prompt, nodeId, updateNodeData]);

  const badges = useMemo(
    () =>
      new Map(
        textSources.map((node) => [node.id, badgeLabelOf(node.data as unknown as TextNodeData)]),
      ),
    [textSources],
  );

  const resolvedPrompt = useMemo(() => {
    const textById = new Map(
      textSources.map((node) => [node.id, (node.data as unknown as TextNodeData).text]),
    );
    return resolvePromptText(prompt, textById);
  }, [prompt, textSources]);

  return { badges, resolvedPrompt };
}

/** 把编辑器 DOM 序列化回带 token 的 prompt 字符串 */
function serialize(root: HTMLElement): string {
  let out = "";
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.textContent ?? "";
        continue;
      }
      if (!(child instanceof HTMLElement)) continue;
      if (child.dataset.token) {
        out += textTokenOf(child.dataset.token);
        continue;
      }
      if (child.tagName === "BR") {
        out += "\n";
        continue;
      }
      // 少数浏览器操作（如从别处粘贴撤销）会产生 div 行
      if (child.tagName === "DIV" && out !== "") out += "\n";
      walk(child);
    }
  };
  walk(root);
  return out;
}

function makeBadge(id: string, badges: Map<string, string>): HTMLSpanElement {
  const span = document.createElement("span");
  span.contentEditable = "false";
  span.dataset.token = id;
  span.className =
    "mx-0.5 inline-flex select-none items-center rounded-md bg-secondary px-1.5 py-px align-middle text-secondary-foreground text-xs";
  span.textContent = badges.get(id) ?? "文本";
  return span;
}

/** 按 token 字符串重建编辑器内容 */
function render(root: HTMLElement, value: string, badges: Map<string, string>) {
  root.textContent = "";
  const re = new RegExp(TEXT_TOKEN_RE.source, "g");
  let last = 0;
  for (const match of value.matchAll(re)) {
    if (match.index > last) root.append(document.createTextNode(value.slice(last, match.index)));
    const id = match[1];
    if (id) root.append(makeBadge(id, badges));
    last = match.index + match[0].length;
  }
  if (last < value.length) root.append(document.createTextNode(value.slice(last)));
}

type PromptEditorProps = {
  value: string;
  badges: Map<string, string>;
  onChange: (value: string) => void;
  placeholder: string;
};

/**
 * 生成节点的提示词输入框。基于 contentEditable：连入的文本节点在文中
 * 显示为不可编辑的原子徽章（可整体删除），其余部分自由编辑。
 * 非受控 + 按需重建：只有外部 token 增删时才重建 DOM（此时光标丢失可接受），
 * 日常输入只做序列化回写，光标不受影响。
 */
export function PromptEditor({ value, badges, onChange, placeholder }: PromptEditorProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (serialize(el) !== value) {
      render(el, value, badges);
      return;
    }
    // 内容没变但徽章文案可能变了（上游文本节点在编辑），原地更新不动光标
    for (const span of el.querySelectorAll<HTMLElement>("[data-token]")) {
      const label = badges.get(span.dataset.token ?? "");
      if (label && span.textContent !== label) span.textContent = label;
    }
  }, [value, badges]);

  const handlePaste = (event: ClipboardEvent) => {
    // 只收纯文本，防止外部富文本样式混进来
    event.preventDefault();
    document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      // 默认行为会产生 <div> 包行，统一成 <br> 让序列化简单可靠
      event.preventDefault();
      document.execCommand("insertLineBreak");
    }
  };

  return (
    <div className="relative">
      {value === "" && (
        <span className="pointer-events-none absolute top-0 left-0 text-muted-foreground text-sm">
          {placeholder}
        </span>
      )}
      {/* biome-ignore lint/a11y/useSemanticElements: textarea 内嵌不了徽章，只能 contentEditable */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline
        aria-label={placeholder}
        tabIndex={0}
        onInput={() => {
          const el = ref.current;
          if (el) onChange(serialize(el));
        }}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        className={cn(
          "nodrag nowheel max-h-[140px] min-h-16 overflow-y-auto whitespace-pre-wrap break-words text-sm outline-none",
        )}
      />
    </div>
  );
}
