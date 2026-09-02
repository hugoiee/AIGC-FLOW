"use client";

import { NodeToolbar, Position } from "@xyflow/react";
import { Plus } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";

export type FloatLine = { from: { x: number; y: number }; to: { x: number; y: number } };

/**
 * 多选资源时浮在选区右侧的连线端点。按下拖动画出一条虚线（由画布层渲染），
 * 松手位置交给画布决定：落在能接受的节点上就批量连线，否则弹节点选择菜单。
 */
export function FloatingConnector({
  selectedIds,
  visible,
  onDragLine,
  onDrop,
}: {
  selectedIds: string[];
  visible: boolean;
  /** 拖动过程中持续回传线段（屏幕坐标） */
  onDragLine: (line: FloatLine) => void;
  /** 松手位置（屏幕坐标） */
  onDrop: (point: { x: number; y: number }) => void;
}) {
  const handlePointerDown = (event: ReactPointerEvent) => {
    // 不让 React Flow 把这次按下当成画布交互
    event.preventDefault();
    event.stopPropagation();

    const from = { x: event.clientX, y: event.clientY };
    onDragLine({ from, to: from });

    const handleMove = (move: PointerEvent) =>
      onDragLine({ from, to: { x: move.clientX, y: move.clientY } });
    const handleUp = (up: PointerEvent) => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      onDrop({ x: up.clientX, y: up.clientY });
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  return (
    <NodeToolbar nodeId={selectedIds} isVisible={visible} position={Position.Right} offset={18}>
      <button
        type="button"
        aria-label="从选区拉出连线"
        onPointerDown={handlePointerDown}
        className="flex size-6 cursor-crosshair items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:border-[#3b82f6] hover:text-[#3b82f6]"
      >
        <Plus className="pointer-events-none size-3.5" />
      </button>
    </NodeToolbar>
  );
}
