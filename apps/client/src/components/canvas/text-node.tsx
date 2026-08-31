"use client";

import type { TextNodeData } from "@aigc-flow/shared";
import { Handle, type NodeProps, NodeResizer, Position, useReactFlow } from "@xyflow/react";
import { Plus, Type } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { useCanvasActions } from "@/hooks/use-canvas-actions";
import { cn } from "@/lib/utils";
import { GEN_ACCENT, GEN_HANDLE_BASE } from "./gen-node-controls";
import { NodeName } from "./node-name";

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
  // 有直接连线的节点被选中时，本节点显示虚线高亮
  const { neighborIds } = useCanvasActions();
  const isNeighbor = !selected && neighborIds.has(id);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

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
        <div
          className="-top-6 pointer-events-none absolute inset-x-0 flex items-center text-xs"
          style={{ color: GEN_ACCENT }}
        >
          <span className="flex min-w-0 items-center gap-1">
            <Type className="size-3.5 shrink-0" />
            <NodeName nodeId={id} label={text.label} />
          </span>
        </div>
      )}

      {/* biome-ignore lint/a11y/noStaticElementInteractions: 双击进编辑是画布节点的交互习惯，键盘用户可经节点选中后直接输入 */}
      <div
        className={cn(
          "size-full rounded-xl border bg-card p-3 shadow-sm",
          selected && "outline outline-1 outline-[#3b82f6]",
          isNeighbor && "shadow-[0_0_0_2px_#3b82f6,0_0_18px_4px_rgba(59,130,246,0.5)]",
        )}
        onDoubleClick={() => setEditing(true)}
      >
        {editing ? (
          <Textarea
            ref={textareaRef}
            value={text.text}
            onChange={(event) => updateNodeData(id, { text: event.target.value })}
            onBlur={() => setEditing(false)}
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
