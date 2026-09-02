"use client";

import {
  IMAGE_GEN_NODE_TYPE,
  imageTokenOf,
  MEDIA_NODE_TYPE,
  type MediaNodeData,
  PROMPT_TOKEN_RE,
  removePromptTokens,
  resolveImageRefs,
  resolvePromptText,
  syncPromptTokens,
  TEXT_NODE_TYPE,
  type TextNodeData,
  textTokenOf,
} from "@aigc-flow/shared";
import { useReactFlow } from "@xyflow/react";
import { ImageIcon } from "lucide-react";
import {
  type ClipboardEvent,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { PREVIEW_WIDTH, resizedImageUrl, THUMB_WIDTH } from "@/lib/media-url";
import { nodeMediaOf } from "@/lib/node-media";
import { cn } from "@/lib/utils";

/** 徽章文案：内容前几个字最有辨识度，空内容退回节点名 */
function badgeLabelOf(data: TextNodeData): string {
  const head = data.text.trim().replace(/\s+/g, " ").slice(0, 10);
  return head || data.label;
}

type UpstreamNode = { id: string; type?: string; data: Record<string, unknown> } | null;

/**
 * prompt 里能用 @ 引用的一张图。id 是上游节点 id，label 是节点名
 * （上传的素材就是文件名），url 只在图片已就绪时有 —— 还在上传 / 生成中的
 * 也列出来（徽章不能因为上游在重新生成就凭空消失），只是发请求时会被跳过。
 */
export type PromptImageRef = { id: string; label: string; url?: string };

/** 上游节点是不是「图片类」：图片媒体节点，或图像生成节点（结果可链式引用） */
function isImageSource(node: NonNullable<UpstreamNode>): boolean {
  if (node.type === IMAGE_GEN_NODE_TYPE) return true;
  return node.type === MEDIA_NODE_TYPE && (node.data as unknown as MediaNodeData).kind === "image";
}

function promptImageRefOf(node: NonNullable<UpstreamNode>): PromptImageRef {
  const label = node.data.label;
  const media = nodeMediaOf(node);
  return {
    id: node.id,
    label: typeof label === "string" && label !== "" ? label : "图片",
    url: media?.kind === "image" ? media.url : undefined,
  };
}

/**
 * 生成节点的 prompt ↔ 上游节点的粘合逻辑：
 * - 新连上的文本节点把徽章 token 追加到 prompt 末尾，断线的移除
 *   （用户手动删掉徽章但连线还在的不动，位置语义以徽章为准，断线重连可重新插入）
 * - 图片不自动插入（@ 是用户的显式动作），但断线时同样移除对应徽章
 * - badges / images 给编辑器渲染徽章，resolvedPrompt 与 resolvedImageUrls 是
 *   发请求用的最终文本和 image_list（被 @ 引用的图按出现顺序排在前面）
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
  const images = useMemo(
    () =>
      sources
        .filter((node): node is NonNullable<UpstreamNode> => node !== null && isImageSource(node))
        .map(promptImageRefOf),
    [sources],
  );
  const textIdsKey = textSources.map((node) => node.id).join(",");
  const imageIdsKey = images.map((image) => image.id).join(",");

  // 初始视为已同步：挂载时不把用户上次手动删掉的徽章补回来
  const prevIdsRef = useRef<{ text: string[]; image: string[] } | null>(null);

  useEffect(() => {
    const split = (key: string) => (key === "" ? [] : key.split(","));
    const ids = { text: split(textIdsKey), image: split(imageIdsKey) };
    const prev = prevIdsRef.current;
    prevIdsRef.current = ids;
    if (prev === null) return;

    const addedText = ids.text.filter((id) => !prev.text.includes(id));
    const removedText = prev.text.filter((id) => !ids.text.includes(id));
    const removedImages = prev.image.filter((id) => !ids.image.includes(id));
    if (addedText.length === 0 && removedText.length === 0 && removedImages.length === 0) return;

    const synced = removePromptTokens(
      syncPromptTokens(prompt, addedText, removedText),
      "image",
      removedImages,
    );
    if (synced !== prompt) updateNodeData(nodeId, { prompt: synced });
  }, [textIdsKey, imageIdsKey, prompt, nodeId, updateNodeData]);

  const badges = useMemo(
    () =>
      new Map(
        textSources.map((node) => [node.id, badgeLabelOf(node.data as unknown as TextNodeData)]),
      ),
    [textSources],
  );

  const resolved = useMemo(() => {
    const textById = new Map(
      textSources.map((node) => [node.id, (node.data as unknown as TextNodeData).text]),
    );
    const ready = images.filter((image): image is PromptImageRef & { url: string } =>
      Boolean(image.url),
    );
    return resolveImageRefs(resolvePromptText(prompt, textById), ready);
  }, [prompt, textSources, images]);

  return {
    badges,
    images,
    resolvedPrompt: resolved.prompt,
    resolvedImageUrls: resolved.imageUrls,
  };
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
      if (child.dataset.image) {
        out += imageTokenOf(child.dataset.image);
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

/** 图片徽章：@ + 节点名，悬停时由编辑器在上方浮出缩略图 */
function makeImageBadge(id: string, images: Map<string, PromptImageRef>): HTMLSpanElement {
  const span = document.createElement("span");
  span.contentEditable = "false";
  span.dataset.image = id;
  span.className =
    "mx-0.5 inline-flex max-w-40 select-none items-center gap-0.5 rounded-md bg-primary/10 px-1.5 py-px align-middle text-primary text-xs";
  const at = document.createElement("span");
  at.className = "opacity-60";
  at.textContent = "@";
  const name = document.createElement("span");
  name.className = "truncate";
  name.dataset.label = "";
  name.textContent = images.get(id)?.label ?? "图片";
  span.append(at, name);
  return span;
}

/** 按 token 字符串重建编辑器内容 */
function render(
  root: HTMLElement,
  value: string,
  badges: Map<string, string>,
  images: Map<string, PromptImageRef>,
) {
  root.textContent = "";
  const re = new RegExp(PROMPT_TOKEN_RE.source, "g");
  let last = 0;
  for (const match of value.matchAll(re)) {
    if (match.index > last) root.append(document.createTextNode(value.slice(last, match.index)));
    const [, kind, id] = match;
    if (id) root.append(kind === "image" ? makeImageBadge(id, images) : makeBadge(id, badges));
    last = match.index + match[0].length;
  }
  if (last < value.length) root.append(document.createTextNode(value.slice(last)));
}

/** 触发 @ 菜单的字符：中文输入法在中文标点模式下打出来的是全角的 ＠ */
const MENTION_TRIGGERS = ["@", "＠"];

type MentionAnchor = { node: Text; offset: number };

type MentionState = {
  /** @ 之后、光标之前的文字，用来过滤候选 */
  query: string;
  /** @ 字符在屏幕上的位置，菜单挂在它下方 */
  left: number;
  bottom: number;
  active: number;
};

/**
 * 看光标前有没有一个还没「用完」的 @：同一个文本节点里，@ 到光标之间没有空白。
 * 找到就返回它的位置，菜单据此定位、选中后据此替换。
 */
function findMention(root: HTMLElement): (MentionAnchor & { query: string; rect: DOMRect }) | null {
  const selection = window.getSelection();
  if (!selection?.isCollapsed || selection.rangeCount === 0) return null;
  const { anchorNode: node, anchorOffset: offset } = selection;
  if (!(node instanceof Text) || !root.contains(node)) return null;

  const before = node.data.slice(0, offset);
  const at = Math.max(...MENTION_TRIGGERS.map((trigger) => before.lastIndexOf(trigger)));
  if (at === -1) return null;
  const query = before.slice(at + 1);
  if (/\s/.test(query)) return null;

  const range = document.createRange();
  range.setStart(node, at);
  range.setEnd(node, at + 1);
  return { node, offset: at, query, rect: range.getBoundingClientRect() };
}

type PromptEditorProps = {
  value: string;
  badges: Map<string, string>;
  images: PromptImageRef[];
  onChange: (value: string) => void;
  placeholder: string;
};

/**
 * 生成节点的提示词输入框。基于 contentEditable：连入的文本节点在文中
 * 显示为不可编辑的原子徽章（可整体删除），其余部分自由编辑。
 * 非受控 + 按需重建：只有外部 token 增删时才重建 DOM（此时光标丢失可接受），
 * 日常输入只做序列化回写，光标不受影响。
 * 输入 @ 弹出已连入的参考图列表，选中后在原地插入图片徽章，悬停徽章看缩略图。
 */
export function PromptEditor({ value, badges, images, onChange, placeholder }: PromptEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const imageById = useMemo(() => new Map(images.map((image) => [image.id, image])), [images]);

  const [mention, setMention] = useState<MentionState | null>(null);
  // @ 所在的文本节点和偏移。DOM 引用不进 state（不参与渲染），选中候选时用来定位替换区间
  const anchorRef = useRef<MentionAnchor | null>(null);
  const composingRef = useRef(false);
  const [preview, setPreview] = useState<{ id: string; rect: DOMRect } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (serialize(el) !== value) {
      render(el, value, badges, imageById);
      setMention(null);
      return;
    }
    // 内容没变但徽章文案可能变了（上游节点在编辑 / 改名），原地更新不动光标
    for (const span of el.querySelectorAll<HTMLElement>("[data-token]")) {
      const label = badges.get(span.dataset.token ?? "");
      if (label && span.textContent !== label) span.textContent = label;
    }
    for (const span of el.querySelectorAll<HTMLElement>("[data-image]")) {
      const label = imageById.get(span.dataset.image ?? "")?.label;
      const name = span.querySelector<HTMLElement>("[data-label]");
      if (label && name && name.textContent !== label) name.textContent = label;
    }
  }, [value, badges, imageById]);

  const candidates = useMemo(() => {
    if (!mention) return [];
    const query = mention.query.toLowerCase();
    return images.filter((image) => image.label.toLowerCase().includes(query));
  }, [mention, images]);

  /** 每次输入 / 光标移动后重新判断 @ 菜单该开还是该关 */
  const refreshMention = () => {
    const el = ref.current;
    if (!el || composingRef.current) return;
    const found = findMention(el);
    if (!found) {
      anchorRef.current = null;
      setMention(null);
      return;
    }
    anchorRef.current = { node: found.node, offset: found.offset };
    setMention((prev) => ({
      query: found.query,
      left: found.rect.left,
      bottom: found.rect.bottom,
      // 过滤词变了就回到第一项
      active: prev && prev.query === found.query ? prev.active : 0,
    }));
  };

  /** 把「@ + 过滤词」整段换成图片徽章，光标停在徽章后面的空格之后 */
  const insertImage = (image: PromptImageRef) => {
    const el = ref.current;
    const anchor = anchorRef.current;
    setMention(null);
    anchorRef.current = null;
    if (!el || !anchor?.node.isConnected) return;

    const selection = window.getSelection();
    const caret =
      selection?.anchorNode === anchor.node
        ? selection.anchorOffset
        : Math.min(anchor.node.length, anchor.offset + 1 + (mention?.query.length ?? 0));

    const range = document.createRange();
    range.setStart(anchor.node, anchor.offset);
    range.setEnd(anchor.node, Math.max(caret, anchor.offset + 1));
    range.deleteContents();
    // 徽章后面补一个空格：不可编辑元素排在行尾时浏览器放不下光标，有个空格才能接着打字
    const space = document.createTextNode(" ");
    range.insertNode(space);
    range.insertNode(makeImageBadge(image.id, imageById));

    const after = document.createRange();
    after.setStart(space, 1);
    after.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(after);

    onChange(serialize(el));
  };

  const handlePaste = (event: ClipboardEvent) => {
    // 只收纯文本，防止外部富文本样式混进来
    event.preventDefault();
    document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (mention) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (candidates.length === 0) return;
        const step = event.key === "ArrowDown" ? 1 : -1;
        setMention({
          ...mention,
          active: (mention.active + step + candidates.length) % candidates.length,
        });
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMention(null);
        return;
      }
      const picked = candidates[mention.active];
      if ((event.key === "Enter" || event.key === "Tab") && picked) {
        event.preventDefault();
        insertImage(picked);
        return;
      }
    }
    if (event.key === "Enter") {
      // 默认行为会产生 <div> 包行，统一成 <br> 让序列化简单可靠
      event.preventDefault();
      document.execCommand("insertLineBreak");
    }
  };

  const badgeOf = (event: PointerEvent) =>
    (event.target as HTMLElement).closest<HTMLElement>("[data-image]");

  const handlePointerOver = (event: PointerEvent) => {
    const badge = badgeOf(event);
    if (badge?.dataset.image) {
      setPreview({ id: badge.dataset.image, rect: badge.getBoundingClientRect() });
    }
  };

  const handlePointerOut = (event: PointerEvent) => {
    const badge = badgeOf(event);
    if (badge && !badge.contains(event.relatedTarget as Node | null)) setPreview(null);
  };

  const previewImage = preview ? imageById.get(preview.id) : undefined;

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
          refreshMention();
        }}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
          refreshMention();
        }}
        onClick={refreshMention}
        onBlur={() => {
          setMention(null);
          setPreview(null);
        }}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        className={cn(
          "nodrag nowheel max-h-[140px] min-h-16 overflow-y-auto whitespace-pre-wrap break-words text-sm outline-none",
        )}
      />

      {mention &&
        createPortal(
          <MentionMenu
            state={mention}
            candidates={candidates}
            hasImages={images.length > 0}
            onHover={(active) => setMention({ ...mention, active })}
            onPick={insertImage}
          />,
          document.body,
        )}

      {preview &&
        previewImage?.url &&
        createPortal(
          <ImagePreview label={previewImage.label} url={previewImage.url} rect={preview.rect} />,
          document.body,
        )}
    </div>
  );
}

/**
 * @ 候选菜单。挂到 body 上用屏幕坐标定位：编辑器本身套在按 1/zoom 反向缩放的
 * 菜单容器里，再往外还有 React Flow 的视口变换，挂在原地算位置太绕。
 * 项上 mousedown 要拦掉，否则编辑器先失焦、菜单先关，click 就落空了。
 */
function MentionMenu({
  state,
  candidates,
  hasImages,
  onHover,
  onPick,
}: {
  state: MentionState;
  candidates: PromptImageRef[];
  hasImages: boolean;
  onHover: (index: number) => void;
  onPick: (image: PromptImageRef) => void;
}) {
  return (
    <div
      role="listbox"
      aria-label="引用参考图"
      style={{ position: "fixed", left: state.left, top: state.bottom + 4 }}
      className="z-50 w-56 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
    >
      {candidates.length === 0 ? (
        <p className="px-2 py-1.5 text-muted-foreground text-xs">
          {hasImages ? "没有匹配的图片" : "先把图片连到这个节点，才能用 @ 引用"}
        </p>
      ) : (
        candidates.map((image, index) => (
          <button
            key={image.id}
            type="button"
            role="option"
            aria-selected={index === state.active}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => onHover(index)}
            onClick={() => onPick(image)}
            className={cn(
              "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs",
              index === state.active && "bg-accent text-accent-foreground",
            )}
          >
            <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted/40">
              {image.url ? (
                // biome-ignore lint/performance/noImgElement: 画布素材缩略图，无需 next/image
                <img
                  src={resizedImageUrl(image.url, THUMB_WIDTH)}
                  alt=""
                  draggable={false}
                  className="size-full object-cover"
                />
              ) : (
                <ImageIcon className="size-3.5 text-muted-foreground/60" strokeWidth={1.5} />
              )}
            </span>
            <span className="truncate">{image.label}</span>
          </button>
        ))
      )}
    </div>
  );
}

/** 悬停在图片徽章上时浮在徽章上方的缩略图 */
function ImagePreview({ label, url, rect }: { label: string; url: string; rect: DOMRect }) {
  return (
    <div
      style={{
        position: "fixed",
        left: rect.left + rect.width / 2,
        top: rect.top - 6,
        transform: "translate(-50%, -100%)",
      }}
      className="pointer-events-none z-50 rounded-md border bg-popover p-1 shadow-md"
    >
      {/* biome-ignore lint/performance/noImgElement: 画布素材缩略图，无需 next/image */}
      <img
        src={resizedImageUrl(url, PREVIEW_WIDTH)}
        alt={label}
        draggable={false}
        className="max-h-40 max-w-40 rounded-sm object-contain"
      />
      <p className="mt-1 max-w-40 truncate text-center text-[10px] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
