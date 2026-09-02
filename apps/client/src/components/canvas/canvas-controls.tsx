"use client";

import { useReactFlow, useStore, useStoreApi } from "@xyflow/react";
import { Lock, LockOpen, Map as MapIcon, Maximize, Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** 缩放比例菜单里的常用档位 */
const ZOOM_PRESETS = [0.1, 0.25, 0.5, 0.75, 1] as const;

/** 缩放动画时长（ms），和 React Flow 自带控件的手感一致 */
const ZOOM_DURATION = 200;

/**
 * 左下角的画布控制条：缩小 / 当前比例（点开选档位）/ 放大 / 适应画布 / 锁定 / 缩略图。
 * 替代 React Flow 自带的 <Controls>，好和顶部、底部的按钮组统一成同一种胶囊风格；
 * 但它是辅助性的，层级要比那几组弱 —— 底色更透、阴影更浅、图标用次要色。
 * 锁定的实现和自带控件一样：直接改 store 里的三个交互开关。它们同时也由
 * 移动 / 选择模式通过 props 控制，切模式时会被 props 重新写回，锁定态随之解除。
 */
export function CanvasControls({
  showMiniMap,
  onToggleMiniMap,
}: {
  showMiniMap: boolean;
  onToggleMiniMap: () => void;
}) {
  const { zoomIn, zoomOut, zoomTo, fitView } = useReactFlow();
  const store = useStoreApi();
  const zoom = useStore((state) => state.transform[2]);
  const isInteractive = useStore(
    (state) => state.nodesDraggable || state.nodesConnectable || state.elementsSelectable,
  );

  const toggleInteractive = () => {
    store.setState({
      nodesDraggable: !isInteractive,
      nodesConnectable: !isInteractive,
      elementsSelectable: !isInteractive,
    });
  };

  return (
    <div className="flex items-center gap-0.5 rounded-xl border border-border/60 bg-background/70 p-1 text-muted-foreground shadow-sm backdrop-blur-sm">
      <ControlButton label="缩小" onClick={() => void zoomOut({ duration: ZOOM_DURATION })}>
        <Minus />
      </ControlButton>

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label="缩放比例"
                className="w-14 px-1 font-normal text-muted-foreground tabular-nums"
              >
                {Math.round(zoom * 100)}%
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">缩放比例</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="center" side="top" className="min-w-24">
          {ZOOM_PRESETS.map((level) => (
            <DropdownMenuItem
              key={level}
              onSelect={() => void zoomTo(level, { duration: ZOOM_DURATION })}
              className={cn(
                "justify-center tabular-nums",
                Math.abs(zoom - level) < 0.005 && "bg-accent",
              )}
            >
              {Math.round(level * 100)}%
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <ControlButton label="放大" onClick={() => void zoomIn({ duration: ZOOM_DURATION })}>
        <Plus />
      </ControlButton>

      <Separator orientation="vertical" className="!h-5 mx-0.5" />

      <ControlButton label="适应画布" onClick={() => void fitView({ duration: ZOOM_DURATION })}>
        <Maximize />
      </ControlButton>

      <ControlButton
        label={isInteractive ? "锁定画布（禁止选中、拖动、连线）" : "解除锁定"}
        onClick={toggleInteractive}
      >
        {isInteractive ? <LockOpen /> : <Lock />}
      </ControlButton>

      <ControlButton label={showMiniMap ? "隐藏缩略图" : "显示缩略图"} onClick={onToggleMiniMap}>
        <MapIcon />
      </ControlButton>
    </div>
  );
}

function ControlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          onClick={onClick}
          className="text-muted-foreground"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
