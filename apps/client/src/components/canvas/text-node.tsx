"use client";

import { TEXT_NODE_WIDTH, type TextNodeData } from "@aigc-flow/shared";
import { Handle, type NodeProps, Position, useReactFlow } from "@xyflow/react";
import { Plus, Type } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { GEN_ACCENT, GEN_HANDLE_BASE } from "./gen-node-controls";
import { NodeName } from "./node-name";

/**
 * 文本节点：一块 Textarea。右侧 source 连到图像 / 视频生成节点后，
 * 在对方的 prompt 输入框里显示为徽章，发请求时按徽章位置插入文本内容。
 */
export function TextNode({ id, data, selected }: NodeProps) {
  const text = data as unknown as TextNodeData;
  const { updateNodeData } = useReactFlow();

  return (
    <>
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

      <div
        className={cn(
          "rounded-xl border bg-card p-3 shadow-sm",
          selected && "outline outline-1 outline-[#3b82f6]",
        )}
        style={{ width: TEXT_NODE_WIDTH }}
      >
        <Textarea
          value={text.text}
          onChange={(event) => updateNodeData(id, { text: event.target.value })}
          placeholder="输入提示词片段…"
          className="nodrag nowheel max-h-60 min-h-24 resize-none border-none p-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
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
