"use client";

import type { TextNodeData } from "@aigc-flow/shared";
import {
  Handle,
  type NodeProps,
  NodeResizer,
  Position,
  useReactFlow,
  useStore,
} from "@xyflow/react";
import { Plus, Type } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { GEN_ACCENT, GEN_HANDLE_BASE } from "./gen-node-controls";
import { NodeInfoBar } from "./node-info-bar";

/** 缩放手柄样式，对齐媒体节点 */
const RESIZE_HANDLE_STYLE = {
  width: 9,
  height: 9,
  borderRadius: 2,
  border: `1px solid ${GEN_ACCENT}`,
  backgroundColor: "#fff",
} as const;

/**
 * 文本节点。单击是选中 / 拖动，双击进入编辑（失焦退出），可自由拉伸大小。
 * 右侧 source 连到生成节点后在对方 prompt 里显示为徽章，按位置插入内容。
 */
export function TextNode({ id, data, selected }: NodeProps) {
  const text = data as unknown as TextNodeData;
  const { updateNodeData } = useReactFlow();
  const [editing, setEditing] = useState(false);
  // 信息条要在屏幕上保持固定大小；没选中时没有信息条，返回常量免得跟着缩放重渲
  const zoom = useStore((state) => (selected ? state.transform[2] : 1));
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /**
   * 编辑期间输入框由这份本地草稿驱动，而不是直接绑 data.text。
   *
   * 中文输入法的坑：绑 data.text 的话，值要绕经 React Flow 的 store 再回流，
   * 这一圈是滞后的，React 一旦发现 value 属性和 DOM 里的值对不上就会写回去，
   * 而**在组词过程中改写 value 会摧毁 composition 区** —— 浏览器把下一次组词
   * 当成新文本插到光标处，于是「中文」会打成 zzhzhozhonzhong中wwewen文。
   * 本地 state 是同一次渲染内更新的，value 永远等于 DOM 里的值，React 不会写回。
   */
  const [draft, setDraft] = useState(text.text);
  /** 组词进行中。中间态（拼音）不写进 graph，见 flush */
  const composingRef = useRef(false);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  /** 把输入框里的值写回节点。组词中间态不写 —— 拼音会顺着连线跑进生成节点的徽章 */
  function flush(value: string) {
    setDraft(value);
    if (!composingRef.current) updateNodeData(id, { text: value });
  }

  return (
    <>
      <NodeResizer
        isVisible={Boolean(selected)}
        color={GEN_ACCENT}
        handleStyle={RESIZE_HANDLE_STYLE}
        lineStyle={{ borderWidth: 0 }}
        minWidth={200}
        minHeight={96}
      />

      {selected && (
        <NodeInfoBar nodeId={id} label={text.label} icon={Type} accent={GEN_ACCENT} zoom={zoom} />
      )}

      {/* biome-ignore lint/a11y/noStaticElementInteractions: 双击进编辑是画布节点的交互习惯，键盘用户可经节点选中后直接输入 */}
      <div
        className={cn(
          "size-full rounded-xl border bg-card p-3 shadow-sm",
          selected && "outline outline-1 outline-[#3b82f6]",
        )}
        onDoubleClick={() => {
          // 草稿在进编辑这一刻取一次就够了。不能放到 effect 里跟着 text.text 走，
          // 那样每次回流都会重置草稿，正是上面要避开的那件事
          setDraft(text.text);
          setEditing(true);
        }}
      >
        {editing ? (
          <Textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => flush(event.target.value)}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            // compositionend 和最后那次 input 的先后顺序各浏览器不一致，
            // 所以两头都写一次：先落地的那次生效，另一次是同值幂等
            onCompositionEnd={(event) => {
              composingRef.current = false;
              flush(event.currentTarget.value);
            }}
            onBlur={(event) => {
              // 组词没结束就失焦（点了别处）时，把已经上屏的部分收下
              composingRef.current = false;
              flush(event.currentTarget.value);
              setEditing(false);
            }}
            placeholder="输入提示词片段…"
            className="nodrag nowheel size-full min-h-0 resize-none border-none p-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
        ) : (
          <div className="size-full select-none overflow-hidden whitespace-pre-wrap break-words text-sm">
            {text.text || <span className="text-muted-foreground">双击输入提示词片段…</span>}
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{
          ...GEN_HANDLE_BASE,
          right: -10,
          opacity: selected ? 1 : 0,
          pointerEvents: selected ? "auto" : "none",
        }}
      >
        <Plus className="pointer-events-none size-3" />
      </Handle>
    </>
  );
}
