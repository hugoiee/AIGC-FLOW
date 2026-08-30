"use client";

import { CircleDot, LogIn, LogOut, Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * 可添加的节点种类。用的是 React Flow 内置的三种类型，
 * 差别只在连接点：input 只有出口，output 只有入口，default 两头都有。
 * 真实的 AIGC 语义节点（文生图 / 图生视频…）留到接模型调用时再做。
 */
export const NODE_KINDS = [
  { type: "input", label: "输入", icon: LogIn, hint: "流程起点，只有出口" },
  { type: "default", label: "处理", icon: CircleDot, hint: "中间步骤，两头都能连" },
  { type: "output", label: "输出", icon: LogOut, hint: "流程终点，只有入口" },
] as const;

export type NodeKind = (typeof NODE_KINDS)[number]["type"];

type NodePaletteProps = {
  onAdd: (kind: NodeKind) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
};

export function NodePalette({ onAdd, canUndo, canRedo, onUndo, onRedo }: NodePaletteProps) {
  return (
    <div className="flex items-center gap-0.5 rounded-xl border bg-background/90 p-1 shadow-lg backdrop-blur-sm">
      {NODE_KINDS.map(({ type, label, icon: Icon, hint }) => (
        <Tooltip key={type}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onAdd(type)}
              aria-label={`添加${label}节点`}
            >
              <Icon />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="font-medium">添加{label}节点</p>
            <p className="opacity-75">{hint}</p>
          </TooltipContent>
        </Tooltip>
      ))}

      <Separator orientation="vertical" className="!h-5 mx-1" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label="撤销"
          >
            <Undo2 />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">撤销 ⌘Z</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRedo}
            disabled={!canRedo}
            aria-label="重做"
          >
            <Redo2 />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">重做 ⇧⌘Z</TooltipContent>
      </Tooltip>
    </div>
  );
}
