"use client";

import { Position } from "@xyflow/react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** 生成类节点选中态的强调色，和媒体节点保持一致 */
export const GEN_ACCENT = "#3b82f6";

/** 骑在占位符边缘垂直中心的圆形连接点，图像 / 视频生成节点共用 */
export const GEN_HANDLE_BASE: CSSProperties = {
  width: 20,
  height: 20,
  borderRadius: 9999,
  border: "1px solid var(--border)",
  backgroundColor: "var(--background)",
  color: "var(--muted-foreground)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

/**
 * 端点的反向缩放：画布缩小后端点在屏幕上跟着缩，缩到两成时只剩 4px 根本抓不住，
 * 所以和信息条、功能面板一样按 1/zoom 放大，在屏幕上保持原大小。
 * React Flow 自己的 .react-flow__handle-left / -right 靠 translate(∓50%, -50%) 把端点
 * 骑到边上，行内 transform 会整个盖掉它，这里得把那段 translate 原样带上。
 * 缩放以端点中心为原点，中心不动，连线的落点和 React Flow 量到的端点位置也就不动。
 */
export function handleScaleStyle(zoom: number, position: Position): CSSProperties {
  const tx = position === Position.Left ? "-50%" : "50%";
  return { transform: `translate(${tx}, -50%) scale(${1 / zoom})` };
}

/** 设置弹层里的胶囊选项（质量 / 分辨率 / 时长等） */
export function PillOption({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-4 py-1.5 text-sm transition-colors hover:bg-accent",
        active && "border-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** 宽高比网格里的一格：小矩形示意 + 文案。宽高传 0 或 label 为 auto/adaptive 时只显示文字 */
export function RatioOption({
  label,
  width,
  height,
  active,
  onClick,
}: {
  label: string;
  width: number;
  height: number;
  active: boolean;
  onClick: () => void;
}) {
  const textOnly = width <= 0 || height <= 0;
  const ratio = textOnly ? 1 : width / height;
  const box = ratio >= 1 ? { width: 20, height: 20 / ratio } : { width: 20 * ratio, height: 20 };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-16 flex-col items-center justify-center gap-1.5 rounded-lg border text-xs transition-colors hover:bg-accent",
        active && "border-foreground",
      )}
    >
      {textOnly ? (
        <span className="text-muted-foreground text-sm">{label}</span>
      ) : (
        <>
          <span className="rounded-[3px] border-[1.5px] border-foreground/70" style={box} />
          <span>{label}</span>
        </>
      )}
    </button>
  );
}
