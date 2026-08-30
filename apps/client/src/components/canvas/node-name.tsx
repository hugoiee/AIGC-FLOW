"use client";

import { useRef, useState } from "react";
import { useCanvasActions } from "@/hooks/use-canvas-actions";
import { cn } from "@/lib/utils";

type NodeNameProps = {
  nodeId: string;
  label: string;
  className?: string;
};

/**
 * 节点名称，双击变输入框：回车 / 失焦提交，Esc 放弃。
 * 媒体节点的信息条和编组的标题栏共用这一份。
 *
 * 配色跟随父级的 color（输入框边框用 currentColor），所以放在蓝色信息条里
 * 就是蓝框，放在编组标题里就是灰框，组件本身不关心用在哪。
 */
export function NodeName({ nodeId, label, className }: NodeNameProps) {
  const { renameNode } = useCanvasActions();
  const [draft, setDraft] = useState<string | null>(null);
  // Esc 是「先标记放弃再 blur」，靠这个标记让 onBlur 知道不要提交
  const cancelled = useRef(false);

  function finish() {
    if (cancelled.current) {
      cancelled.current = false;
      setDraft(null);
      return;
    }
    const next = draft?.trim() ?? "";
    // 空名字等同于放弃：画布上一个没有名字的节点没法辨认
    if (next && next !== label) renameNode(nodeId, next);
    setDraft(null);
  }

  if (draft === null) {
    return (
      <button
        type="button"
        // nodrag 让双击选词不会变成拖节点；stopPropagation 挡住 React Flow 自己的双击处理
        className={cn("nodrag pointer-events-auto cursor-text truncate bg-transparent", className)}
        onDoubleClick={(event) => {
          event.stopPropagation();
          setDraft(label);
        }}
        title="双击改名"
      >
        {label}
      </button>
    );
  }

  return (
    <input
      // biome-ignore lint/a11y/noAutofocus: 双击进入编辑态，光标必须立刻落进来
      autoFocus
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={finish}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        else if (event.key === "Escape") {
          cancelled.current = true;
          event.currentTarget.blur();
        }
      }}
      className={cn(
        "nodrag nopan pointer-events-auto min-w-0 flex-1 rounded-sm border border-current bg-background px-1 text-foreground outline-none",
        className,
      )}
    />
  );
}
