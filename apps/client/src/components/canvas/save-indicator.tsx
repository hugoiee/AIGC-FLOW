"use client";

import { Check, CircleAlert, Loader2 } from "lucide-react";
import type { SaveStatus } from "@/hooks/use-graph-autosave";
import { cn } from "@/lib/utils";

const PRESET: Record<SaveStatus, { text: string; className: string }> = {
  saved: { text: "已保存", className: "text-muted-foreground" },
  dirty: { text: "未保存", className: "text-amber-600 dark:text-amber-500" },
  saving: { text: "保存中…", className: "text-muted-foreground" },
  error: { text: "保存失败", className: "text-destructive" },
};

export function SaveIndicator({ status }: { status: SaveStatus }) {
  const { text, className } = PRESET[status];

  return (
    <span className={cn("flex items-center gap-1.5 text-xs", className)} aria-live="polite">
      {status === "saving" && <Loader2 className="size-3 animate-spin" />}
      {status === "saved" && <Check className="size-3" />}
      {status === "error" && <CircleAlert className="size-3" />}
      {status === "dirty" && <span className="size-1.5 rounded-full bg-current" />}
      {text}
    </span>
  );
}
