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
 * 底色要和画布拉开距离，让人一眼看出「这一片是一个组」，但只用中性灰、不上彩色
 * （彩色留给选中态和素材徽章）。注意别用 muted：浅色画布底是 #F5F5F5，
 * 和 --muted 几乎同值，铺上去等于没画。浅色用前景色的 8% 透明叠加（点阵还能
 * 隐约透出来），深色 muted 本身就比画布亮两档，直接不透明铺满更清楚。
 * 顺带解决了全透明时框内空白处点不中编组本身的问题。
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
          "size-full rounded-lg border-2 border-dashed bg-foreground/8 dark:bg-muted",
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
