"use client";

import { GROUP_HEADER_HEIGHT } from "@aigc-flow/shared";
import { type NodeProps, NodeResizer } from "@xyflow/react";
import { Group } from "lucide-react";
import { cn } from "@/lib/utils";
import { NodeName } from "./node-name";

/** 选中态的强调色，和媒体节点用同一个 —— 主题的 primary 是近黑色，做不出选框的意思 */
const ACCENT = "#3b82f6";

const RESIZE_HANDLE_STYLE = {
  width: 9,
  height: 9,
  borderRadius: 2,
  border: `1px solid ${ACCENT}`,
  backgroundColor: "#fff",
} as const;

/**
 * 编组：一个把成员框在里面的容器节点。
 *
 * 成员是 React Flow 的子节点（parentId 指向它），拖动这个框时成员自动跟随，
 * 这部分不用我们写。这里只负责外观和标题。
 *
 * 底色要有一点填充：全透明的话框内空白处点不中编组本身，
 * 用户会以为这个组选不上。
 */
export function GroupNode({ id, data, selected }: NodeProps) {
  const label = String(data?.label ?? "编组");

  return (
    <>
      {/* 成员被 extent:"parent" 锁在框内，框不能调大的话就没法重新摆放成员了 */}
      <NodeResizer
        isVisible={Boolean(selected)}
        color={ACCENT}
        handleStyle={RESIZE_HANDLE_STYLE}
        lineStyle={{ borderWidth: 0 }}
        minWidth={160}
        minHeight={GROUP_HEADER_HEIGHT + 60}
      />

      <div
        className={cn(
          "size-full rounded-lg border-2 border-dashed bg-muted/25",
          selected ? "border-[#3b82f6]" : "border-border",
        )}
      >
        <div
          className="flex items-center gap-1.5 px-2 text-muted-foreground text-xs"
          style={{ height: GROUP_HEADER_HEIGHT }}
        >
          <Group className="size-3.5 shrink-0" />
          <NodeName nodeId={id} label={label} />
        </div>
      </div>
    </>
  );
}
