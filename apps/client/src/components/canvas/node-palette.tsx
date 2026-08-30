"use client";

import { CircleDot, LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

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
};

export function NodePalette({ onAdd }: NodePaletteProps) {
  return (
    <aside className="flex w-56 shrink-0 flex-col gap-1 border-r bg-background p-3">
      <p className="px-2 pb-2 font-medium text-muted-foreground text-xs">添加节点</p>
      {NODE_KINDS.map(({ type, label, icon: Icon, hint }) => (
        <Button
          key={type}
          variant="ghost"
          className="h-auto justify-start gap-3 px-2 py-2 text-left"
          onClick={() => onAdd(type)}
          title={hint}
        >
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex flex-col items-start">
            <span className="text-sm">{label}</span>
            <span className="font-normal text-muted-foreground text-xs">{hint}</span>
          </span>
        </Button>
      ))}

      <div className="mt-auto space-y-1 px-2 pt-4 text-muted-foreground text-xs leading-relaxed">
        <p>双击节点可改名</p>
        <p>选中后按 Delete 删除</p>
        <p>拖动节点右侧圆点连线</p>
        <p>Cmd+Z / Cmd+Shift+Z 撤销重做</p>
        <p>Cmd+C / Cmd+V 复制粘贴</p>
      </div>
    </aside>
  );
}
