"use client";

import { CircleDot, Hand, LogIn, LogOut, MousePointer2, Redo2, Undo2, Upload } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * 画布左键的两种模式，语义对齐 Figma / 即梦：
 * select 拖空白是框选，move 拖空白是平移画布。
 * 只存在内存里，刷新后回到默认的 select —— 它是主要工作模式。
 */
export const CANVAS_MODES = [
  { mode: "select", label: "选择", icon: MousePointer2, key: "V", hint: "左键拖空白处框选节点" },
  { mode: "move", label: "移动", icon: Hand, key: "H", hint: "左键拖动平移画布" },
] as const;

export type CanvasMode = (typeof CANVAS_MODES)[number]["mode"];

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

/** 文件选择框接受的类型，和服务端 mediaKindOf 的判断保持一致 */
const ACCEPT = "image/*,video/*,audio/*";

type NodePaletteProps = {
  mode: CanvasMode;
  onModeChange: (mode: CanvasMode) => void;
  onAdd: (kind: NodeKind) => void;
  onPickFiles: (files: File[]) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
};

export function NodePalette({
  mode,
  onModeChange,
  onAdd,
  onPickFiles,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: NodePaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-0.5 rounded-xl border bg-background/90 p-1 shadow-lg backdrop-blur-sm">
      <ModeToggle mode={mode} onModeChange={onModeChange} />

      <Separator orientation="vertical" className="!h-5 mx-1" />

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
            onClick={() => inputRef.current?.click()}
            aria-label="上传媒体"
          >
            <Upload />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="font-medium">上传媒体</p>
          <p className="opacity-75">图片 / 视频 / 音频，可多选；也能直接拖进画布</p>
        </TooltipContent>
      </Tooltip>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          // 清空 value，否则连续选同一个文件不会再触发 change
          event.target.value = "";
          if (files.length > 0) onPickFiles(files);
        }}
      />

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

/**
 * 单个按钮承载两种模式：显示当前模式的图标，点一下切到另一种。
 * 刻意用 default（实心黑）而不是 ghost —— 它是模式开关，不是一次性动作，
 * 和右边那排「按一下做件事」的按钮必须一眼看出区别。
 */
function ModeToggle({
  mode,
  onModeChange,
}: {
  mode: CanvasMode;
  onModeChange: (mode: CanvasMode) => void;
}) {
  const current = CANVAS_MODES.find((item) => item.mode === mode) ?? CANVAS_MODES[0];
  const next = CANVAS_MODES.find((item) => item.mode !== mode) ?? CANVAS_MODES[0];
  const Icon = current.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="default"
          size="icon"
          onClick={() => onModeChange(next.mode)}
          aria-label={`当前为${current.label}模式，切换到${next.label}模式`}
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="font-medium">
          {current.label}模式 · {current.key}
        </p>
        <p className="opacity-75">{current.hint}</p>
        <p className="opacity-75">
          点击或按 {next.key} 切到{next.label}模式
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
