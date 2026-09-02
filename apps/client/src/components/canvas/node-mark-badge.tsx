"use client";

import { NODE_MARK_LABEL, type NodeMark } from "@aigc-flow/shared";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** 角标离素材左上角的距离（屏幕 px，不随缩放变） */
const INSET = 6;

/**
 * 素材左上角的标记角标：采用是绿底对勾，废弃是灰底叉。
 *
 * 废弃的主要视觉不是这个角标而是整块素材压暗（见各节点的 rejected 类），
 * 压暗是全节点效果，画布缩到 10% 也看得出来；角标只负责在近处把两种标记
 * 区分开。采用不给素材染色，画布上要保持素材本身的观感，只留这一个角标。
 * 和信息条一样用 1/zoom 反向缩放，缩小画布时在屏幕上还是这么大。
 * 挂在素材区的 relative 容器里，不吃指针事件。
 */
export function NodeMarkBadge({ mark, zoom }: { mark: NodeMark; zoom: number }) {
  const Icon = mark === "keep" ? Check : X;
  return (
    <div
      title={NODE_MARK_LABEL[mark]}
      className={cn(
        "pointer-events-none absolute z-10 flex size-5 items-center justify-center rounded-full shadow-sm",
        mark === "keep" ? "bg-emerald-500 text-white" : "bg-muted-foreground text-background",
      )}
      style={{
        top: INSET,
        left: INSET,
        transform: `scale(${1 / zoom})`,
        transformOrigin: "top left",
      }}
    >
      <Icon className="size-3.5" strokeWidth={3} />
    </div>
  );
}

/** 废弃的素材整块压暗去色。放在素材区自己的容器上，别连选中框和角标一起压 */
export const REJECTED_MEDIA_CLASS = "opacity-40 grayscale";
