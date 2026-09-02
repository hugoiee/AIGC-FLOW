"use client";

import {
  IMAGE_GEN_NODE_TYPE,
  MEDIA_KINDS,
  MEDIA_NODE_TYPE,
  type MediaKind,
  type MediaNodeData,
  type MediaRefSource,
  mediaTokenOf,
  PROMPT_TOKEN_RE,
  type PromptTokenKind,
  removePromptTokens,
  resolveMediaRefs,
  resolvePromptText,
  syncPromptTokens,
  TEXT_NODE_TYPE,
  type TextNodeData,
  textTokenOf,
  VIDEO_GEN_NODE_TYPE,
} from "@aigc-flow/shared";
import { useReactFlow } from "@xyflow/react";
import { FileVideo, ImageIcon, Maximize2, Music } from "lucide-react";
import {
  type ClipboardEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PREVIEW_WIDTH, resizedImageUrl, THUMB_WIDTH } from "@/lib/media-url";
import { nodeMarkOf } from "@/lib/node-mark";
import { nodeMediaOf } from "@/lib/node-media";
import { cn } from "@/lib/utils";

type UpstreamNode = { id: string; type?: string; data: Record<string, unknown> } | null;

/**
 * prompt 里能用 @ 引用的一份素材。id 是上游节点 id，label 是节点名
 * （上传的素材就是文件名），url 只在素材已就绪时有 —— 还在上传 / 生成中的
 * 也列出来（徽章不能因为上游在重新生成就凭空消失），只是发请求时会被跳过。
 * rejected 是上游被标成了「废弃」：不拦着引用，只在徽章和候选里划线提示。
 */
export type PromptMediaRef = {
  id: string;
  kind: MediaKind;
  label: string;
  url?: string;
  rejected: boolean;
};

/** 连入的文本节点在 prompt 里的徽章：显示节点名，悬停看正文 */
export type PromptTextRef = { id: string; label: string; text: string };

/** 每种素材发请求时的上限（image_list / video_list / audio_list 各自的长度） */
export type MediaLimits = Record<MediaKind, number>;

/** 上游节点是哪种素材：媒体节点看 kind，生成节点看产出种类；文本 / 编组不是素材 */
function mediaKindOfNode(node: NonNullable<UpstreamNode>): MediaKind | null {
  if (node.type === MEDIA_NODE_TYPE) return (node.data as unknown as MediaNodeData).kind;
  if (node.type === IMAGE_GEN_NODE_TYPE) return "image";
  if (node.type === VIDEO_GEN_NODE_TYPE) return "video";
  return null;
}

const KIND_LABEL: Record<MediaKind, string> = { image: "图片", video: "视频", audio: "音频" };

function promptMediaRefOf(node: NonNullable<UpstreamNode>, kind: MediaKind): PromptMediaRef {
  const label = node.data.label;
  const media = nodeMediaOf(node);
  return {
    id: node.id,
    kind,
    label: typeof label === "string" && label !== "" ? label : KIND_LABEL[kind],
    url: media?.kind === kind ? media.url : undefined,
    rejected: nodeMarkOf(node) === "reject",
  };
}

/**
 * 生成节点的 prompt ↔ 上游节点的粘合逻辑：
 * - 新连上的文本节点把徽章 token 追加到 prompt 末尾，断线的移除
 *   （用户手动删掉徽章但连线还在的不动，位置语义以徽章为准，断线重连可重新插入）
 * - 素材不自动插入（@ 是用户的显式动作），但断线时同样移除对应徽章
 * - texts / refs 给编辑器渲染徽章；lists 是发请求用的三个列表
 *   （已就绪的连入素材按连线顺序、各自截到 limits 的上限），resolvedPrompt 里的
 *   素材徽章换成了带序号的占位符，序号对应各列表的下标 —— 必须一起发
 */
export function usePromptTokens(
  nodeId: string,
  prompt: string,
  sources: UpstreamNode[],
  limits: MediaLimits,
) {
  const { updateNodeData } = useReactFlow();

  const textSources = useMemo(
    () =>
      sources.filter(
        (node): node is NonNullable<UpstreamNode> => node !== null && node.type === TEXT_NODE_TYPE,
      ),
    [sources],
  );
  const refs = useMemo(
    () =>
      sources.flatMap((node) => {
        const kind = node ? mediaKindOfNode(node) : null;
        return node && kind ? [promptMediaRefOf(node, kind)] : [];
      }),
    [sources],
  );
  const textIdsKey = textSources.map((node) => node.id).join(",");
  const refIdsKey = refs.map((ref) => ref.id).join(",");

  // 初始视为已同步：挂载时不把用户上次手动删掉的徽章补回来
  const prevIdsRef = useRef<{ text: string[]; media: string[] } | null>(null);

  useEffect(() => {
    const split = (key: string) => (key === "" ? [] : key.split(","));
    const ids = { text: split(textIdsKey), media: split(refIdsKey) };
    const prev = prevIdsRef.current;
    prevIdsRef.current = ids;
    if (prev === null) return;

    const addedText = ids.text.filter((id) => !prev.text.includes(id));
    const removedText = prev.text.filter((id) => !ids.text.includes(id));
    const removedMedia = prev.media.filter((id) => !ids.media.includes(id));
    if (addedText.length === 0 && removedText.length === 0 && removedMedia.length === 0) return;

    const synced = removePromptTokens(
      syncPromptTokens(prompt, addedText, removedText),
      removedMedia,
    );
    if (synced !== prompt) updateNodeData(nodeId, { prompt: synced });
  }, [textIdsKey, refIdsKey, prompt, nodeId, updateNodeData]);

  const texts = useMemo(
    () =>
      textSources.map((node): PromptTextRef => {
        const { label, text } = node.data as unknown as TextNodeData;
        return { id: node.id, label: label || "文本", text };
      }),
    [textSources],
  );

  const { image: maxImages, video: maxVideos, audio: maxAudios } = limits;
  const lists = useMemo(() => {
    const ready = (kind: MediaKind, max: number): MediaRefSource[] =>
      refs
        .filter((ref): ref is PromptMediaRef & { url: string } => ref.kind === kind && !!ref.url)
        .slice(0, max)
        .map(({ id, url }) => ({ id, url }));
    return {
      image: ready("image", maxImages),
      video: ready("video", maxVideos),
      audio: ready("audio", maxAudios),
    };
  }, [refs, maxImages, maxVideos, maxAudios]);

  const resolvedPrompt = useMemo(() => {
    const textById = new Map(
      textSources.map((node) => [node.id, (node.data as unknown as TextNodeData).text]),
    );
    return resolveMediaRefs(resolvePromptText(prompt, textById), lists);
  }, [prompt, textSources, lists]);

  const urls = useMemo(
    () => ({
      image: lists.image.map((item) => item.url),
      video: lists.video.map((item) => item.url),
      audio: lists.audio.map((item) => item.url),
    }),
    [lists],
  );

  return { texts, refs, resolvedPrompt, urls };
}

function isMediaKind(value: string | undefined): value is MediaKind {
  return (MEDIA_KINDS as readonly string[]).includes(value ?? "");
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
      if (child.dataset.ref && isMediaKind(child.dataset.kind)) {
        out += mediaTokenOf(child.dataset.kind, child.dataset.ref);
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

/** 徽章共用的盒子样式，配色按种类另加 */
const BADGE_BASE =
  "mx-0.5 inline-flex max-w-40 select-none items-center gap-0.5 rounded-md px-1.5 py-px align-middle text-xs";

/** 文本徽章：琥珀色，和三种素材区分开。显示节点名，正文悬停时浮出 */
const TEXT_BADGE_CLASS = "bg-amber-500/15 text-amber-700 dark:text-amber-300";

function makeTextBadge(id: string, texts: Map<string, PromptTextRef>): HTMLSpanElement {
  const span = document.createElement("span");
  span.contentEditable = "false";
  span.dataset.token = id;
  span.className = cn(BADGE_BASE, TEXT_BADGE_CLASS);
  const name = document.createElement("span");
  name.className = "truncate";
  name.dataset.label = "";
  name.textContent = texts.get(id)?.label ?? "文本";
  span.append(name);
  return span;
}

/** 素材徽章按种类配色：图片绿、音频蓝、视频紫。菜单里的种类图标也用同一组前景色 */
const KIND_BADGE_CLASS: Record<MediaKind, string> = {
  image: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  video: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  audio: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
};

const KIND_TEXT_CLASS: Record<MediaKind, string> = {
  image: "text-emerald-600 dark:text-emerald-300",
  video: "text-violet-600 dark:text-violet-300",
  audio: "text-sky-600 dark:text-sky-300",
};

/** 废弃提示的文案，挂在徽章的 title 上，悬停能看到原因 */
const REJECTED_TITLE = "这份素材已标记为废弃";

/**
 * 上游被标成废弃时徽章划线变淡。直接改 DOM 类名：徽章不是 React 渲染的，
 * 标记变了走和改名同一条同步路径（见编辑器里的 useEffect）。
 */
function syncRejected(span: HTMLElement, rejected: boolean) {
  span.classList.toggle("line-through", rejected);
  span.classList.toggle("opacity-60", rejected);
  if (rejected) span.title = REJECTED_TITLE;
  else span.removeAttribute("title");
}

/** 素材徽章：@ + 节点名，悬停时由编辑器在上方浮出预览 */
function makeMediaBadge(
  kind: MediaKind,
  id: string,
  refs: Map<string, PromptMediaRef>,
): HTMLSpanElement {
  const span = document.createElement("span");
  span.contentEditable = "false";
  span.dataset.ref = id;
  span.dataset.kind = kind;
  span.className = cn(BADGE_BASE, KIND_BADGE_CLASS[kind]);
  const at = document.createElement("span");
  at.className = "opacity-60";
  at.textContent = "@";
  const name = document.createElement("span");
  name.className = "truncate";
  name.dataset.label = "";
  name.textContent = refs.get(id)?.label ?? KIND_LABEL[kind];
  span.append(at, name);
  syncRejected(span, refs.get(id)?.rejected ?? false);
  return span;
}

/** 按 token 字符串重建编辑器内容 */
function render(
  root: HTMLElement,
  value: string,
  texts: Map<string, PromptTextRef>,
  refs: Map<string, PromptMediaRef>,
) {
  root.textContent = "";
  const re = new RegExp(PROMPT_TOKEN_RE.source, "g");
  let last = 0;
  for (const match of value.matchAll(re)) {
    if (match.index > last) root.append(document.createTextNode(value.slice(last, match.index)));
    const [, kind, id] = match as unknown as [string, PromptTokenKind, string | undefined];
    if (id)
      root.append(kind === "text" ? makeTextBadge(id, texts) : makeMediaBadge(kind, id, refs));
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
  texts: PromptTextRef[];
  refs: PromptMediaRef[];
  onChange: (value: string) => void;
  placeholder: string;
  /** 放大编辑弹层的标题里带上节点名，同时开着几个生成节点时知道在改哪个 */
  title?: string;
  /**
   * 内容多到出滚动条时露出「放大编辑」按钮，点开一个盖住整个画面的弹层专心改。
   * 弹层里的那份编辑器自己不能再放大（false），否则套娃。
   */
  expandable?: boolean;
  /** 弹层里的大号形态：更高、字号更大 */
  large?: boolean;
  /** 挂载后聚焦并把光标放到末尾，弹层打开时用 */
  autoFocus?: boolean;
};

/**
 * 生成节点的提示词输入框。基于 contentEditable：连入的文本节点在文中
 * 显示为不可编辑的原子徽章（可整体删除），其余部分自由编辑。
 * 非受控 + 按需重建：只有外部 token 增删时才重建 DOM（此时光标丢失可接受），
 * 日常输入只做序列化回写，光标不受影响。
 * 输入 @ 弹出已连入的参考素材列表，选中后在原地插入素材徽章，悬停徽章看预览。
 */
export function PromptEditor({
  value,
  texts,
  refs,
  onChange,
  placeholder,
  title,
  expandable = true,
  large = false,
  autoFocus = false,
}: PromptEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const textById = useMemo(() => new Map(texts.map((item) => [item.id, item])), [texts]);
  const refById = useMemo(() => new Map(refs.map((item) => [item.id, item])), [refs]);

  const [mention, setMention] = useState<MentionState | null>(null);
  // @ 所在的文本节点和偏移。DOM 引用不进 state（不参与渲染），选中候选时用来定位替换区间
  const anchorRef = useRef<MentionAnchor | null>(null);
  const composingRef = useRef(false);
  const [preview, setPreview] = useState<{
    kind: "text" | "media";
    id: string;
    rect: DOMRect;
  } | null>(null);
  const [expanded, setExpanded] = useState(false);
  // 内容是否已经多到出滚动条：只有这时才露出放大按钮，短提示词不需要它
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (serialize(el) !== value) {
      render(el, value, textById, refById);
      setMention(null);
      return;
    }
    // 内容没变但徽章文案 / 废弃状态可能变了（上游节点改名、打标），原地更新不动光标
    const syncLabel = (span: HTMLElement, label: string | undefined) => {
      const name = span.querySelector<HTMLElement>("[data-label]");
      if (label && name && name.textContent !== label) name.textContent = label;
    };
    for (const span of el.querySelectorAll<HTMLElement>("[data-token]")) {
      syncLabel(span, textById.get(span.dataset.token ?? "")?.label);
    }
    for (const span of el.querySelectorAll<HTMLElement>("[data-ref]")) {
      const item = refById.get(span.dataset.ref ?? "");
      syncLabel(span, item?.label);
      syncRejected(span, item?.rejected ?? false);
    }
  }, [value, textById, refById]);

  // 溢出检测要在内容重建之后量，所以排在上面那个 effect 后面；宽度变化（画布缩放不算，
  // 那是 transform）也会影响换行，用 ResizeObserver 兜住。
  // 内容一旦超过最大高度，盒子就不再长了，ResizeObserver 收不到通知，所以还得跟着 value 重量
  // biome-ignore lint/correctness/useExhaustiveDependencies: value 变了要重新量 scrollHeight
  useEffect(() => {
    const el = ref.current;
    if (!el || !expandable) return;
    const measure = () => setOverflowing(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expandable, value]);

  useEffect(() => {
    if (!autoFocus) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    // focus() 会把光标放到开头，改到末尾接着写更符合预期
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }, [autoFocus]);

  const candidates = useMemo(() => {
    if (!mention) return [];
    const query = mention.query.toLowerCase();
    return refs.filter((item) => item.label.toLowerCase().includes(query));
  }, [mention, refs]);

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

  /** 把「@ + 过滤词」整段换成素材徽章，光标停在徽章后面的空格之后 */
  const insertRef = (item: PromptMediaRef) => {
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
    range.insertNode(makeMediaBadge(item.kind, item.id, refById));

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
        // 放大编辑时 Escape 要先收 @ 菜单，别一下把整个弹层关了（Dialog 在 document 上监听）
        event.stopPropagation();
        setMention(null);
        return;
      }
      const picked = candidates[mention.active];
      if ((event.key === "Enter" || event.key === "Tab") && picked) {
        event.preventDefault();
        insertRef(picked);
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
    (event.target as HTMLElement).closest<HTMLElement>("[data-ref], [data-token]");

  const handlePointerOver = (event: PointerEvent) => {
    const badge = badgeOf(event);
    if (!badge) return;
    const rect = badge.getBoundingClientRect();
    if (badge.dataset.ref) setPreview({ kind: "media", id: badge.dataset.ref, rect });
    else if (badge.dataset.token) setPreview({ kind: "text", id: badge.dataset.token, rect });
  };

  const handlePointerOut = (event: PointerEvent) => {
    const badge = badgeOf(event);
    if (badge && !badge.contains(event.relatedTarget as Node | null)) setPreview(null);
  };

  const previewRef = preview?.kind === "media" ? refById.get(preview.id) : undefined;
  const previewText = preview?.kind === "text" ? textById.get(preview.id) : undefined;

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
          "nodrag nowheel overflow-y-auto whitespace-pre-wrap break-words outline-none",
          large
            ? "max-h-[70vh] min-h-[50vh] text-base leading-relaxed"
            : "max-h-[140px] min-h-16 text-sm",
        )}
      />

      {expandable && overflowing && (
        // 贴在输入框右下角、滚动条内侧；mousedown 拦掉免得点它时编辑器失焦收起 @ 菜单
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="放大编辑"
          title="放大编辑"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setExpanded(true)}
          className="nodrag absolute right-3 bottom-1 bg-card/80 text-muted-foreground backdrop-blur-sm"
        >
          <Maximize2 />
        </Button>
      )}

      {expandable && (
        <Dialog open={expanded} onOpenChange={setExpanded}>
          <DialogContent
            className="sm:max-w-3xl"
            // 自己把光标放到末尾（见 autoFocus），不让 Dialog 抢焦点
            onOpenAutoFocus={(event) => event.preventDefault()}
            // @ 菜单 portal 在弹层外面，点它不算「点到外面」
            onInteractOutside={(event) => {
              const target = event.detail.originalEvent.target as Element | null;
              if (target?.closest('[role="listbox"]')) event.preventDefault();
            }}
          >
            <DialogHeader>
              <DialogTitle>{title ? `${title} · 提示词` : "提示词"}</DialogTitle>
              <DialogDescription>
                和节点里是同一份内容，改完关掉即可；输入 @ 仍可引用已连入的素材。
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border bg-card p-3">
              <PromptEditor
                value={value}
                texts={texts}
                refs={refs}
                onChange={onChange}
                placeholder={placeholder}
                expandable={false}
                large
                autoFocus
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {mention &&
        createPortal(
          <MentionMenu
            state={mention}
            candidates={candidates}
            hasRefs={refs.length > 0}
            onHover={(active) => setMention({ ...mention, active })}
            onPick={insertRef}
          />,
          document.body,
        )}

      {preview &&
        previewRef?.url &&
        createPortal(
          <PreviewCard
            rect={preview.rect}
            label={previewRef.rejected ? `${previewRef.label}（已废弃）` : previewRef.label}
          >
            <MediaPreview kind={previewRef.kind} label={previewRef.label} url={previewRef.url} />
          </PreviewCard>,
          document.body,
        )}

      {preview &&
        previewText &&
        createPortal(
          <PreviewCard rect={preview.rect} label={previewText.label}>
            <p className="line-clamp-6 w-56 whitespace-pre-wrap break-words px-1 text-xs">
              {previewText.text.trim() || <span className="text-muted-foreground">（空）</span>}
            </p>
          </PreviewCard>,
          document.body,
        )}
    </div>
  );
}

function KindIcon({ kind, className }: { kind: MediaKind; className?: string }) {
  const Icon = kind === "image" ? ImageIcon : kind === "video" ? FileVideo : Music;
  return <Icon className={cn(KIND_TEXT_CLASS[kind], className)} strokeWidth={1.5} />;
}

/**
 * @ 候选菜单。挂到 body 上用屏幕坐标定位：编辑器本身套在按 1/zoom 反向缩放的
 * 菜单容器里，再往外还有 React Flow 的视口变换，挂在原地算位置太绕。
 * 项上 mousedown 要拦掉，否则编辑器先失焦、菜单先关，click 就落空了。
 */
function MentionMenu({
  state,
  candidates,
  hasRefs,
  onHover,
  onPick,
}: {
  state: MentionState;
  candidates: PromptMediaRef[];
  hasRefs: boolean;
  onHover: (index: number) => void;
  onPick: (item: PromptMediaRef) => void;
}) {
  return (
    <div
      role="listbox"
      aria-label="引用参考素材"
      style={{ position: "fixed", left: state.left, top: state.bottom + 4 }}
      className="pointer-events-auto z-50 w-56 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
    >
      {candidates.length === 0 ? (
        <p className="px-2 py-1.5 text-muted-foreground text-xs">
          {hasRefs ? "没有匹配的素材" : "先把素材连到这个节点，才能用 @ 引用"}
        </p>
      ) : (
        candidates.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={index === state.active}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => onHover(index)}
            onClick={() => onPick(item)}
            className={cn(
              "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs",
              index === state.active && "bg-accent text-accent-foreground",
            )}
          >
            <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted/40">
              {item.kind === "image" && item.url ? (
                // biome-ignore lint/performance/noImgElement: 画布素材缩略图，无需 next/image
                <img
                  src={resizedImageUrl(item.url, THUMB_WIDTH)}
                  alt=""
                  draggable={false}
                  className="size-full object-cover"
                />
              ) : (
                <KindIcon kind={item.kind} className="size-3.5" />
              )}
            </span>
            <span className={cn("truncate", item.rejected && "line-through opacity-60")}>
              {item.label}
            </span>
          </button>
        ))
      )}
    </div>
  );
}

/** 悬停徽章时浮在徽章上方的卡片壳：定位、底色、底部的名称行 */
function PreviewCard({
  rect,
  label,
  children,
}: {
  rect: DOMRect;
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        position: "fixed",
        left: rect.left + rect.width / 2,
        top: rect.top - 6,
        transform: "translate(-50%, -100%)",
      }}
      className="pointer-events-none z-50 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
    >
      {children}
      <p className="mt-1 max-w-56 truncate text-center text-[10px] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

/** 素材预览：图片出缩略图，视频出静音画面，音频只有图标 */
function MediaPreview({ kind, label, url }: { kind: MediaKind; label: string; url: string }) {
  if (kind === "image") {
    return (
      // biome-ignore lint/performance/noImgElement: 画布素材缩略图，无需 next/image
      <img
        src={resizedImageUrl(url, PREVIEW_WIDTH)}
        alt={label}
        draggable={false}
        className="max-h-40 max-w-40 rounded-sm object-contain"
      />
    );
  }
  if (kind === "video") {
    return (
      <video
        src={url}
        muted
        autoPlay
        loop
        playsInline
        preload="metadata"
        className="max-h-40 max-w-40 rounded-sm bg-black object-contain"
      />
    );
  }
  return (
    <div className="flex h-16 w-40 items-center justify-center rounded-sm bg-muted/40">
      <KindIcon kind="audio" className="size-6" />
    </div>
  );
}
