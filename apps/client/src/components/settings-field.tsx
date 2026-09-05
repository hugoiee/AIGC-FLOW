import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

/**
 * 设置项的统一外壳：标签 + 控件 + 一行说明。
 * 说明和错误共用同一行 —— 出错时原地变红换成错误文案，
 * 不额外插一行，否则每次校验失败整栏都会往下跳一截。
 */
export function SettingsField({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint: ReactNode;
  /** 有值就代表这一项校验失败，说明行换成它 */
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      <p className={error ? "text-destructive text-sm" : "text-muted-foreground text-sm"}>
        {error ?? hint}
      </p>
    </div>
  );
}
