"use client";

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
