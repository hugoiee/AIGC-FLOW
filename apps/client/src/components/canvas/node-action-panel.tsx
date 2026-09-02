"use client";

import { NODE_MARK_LABEL, type NodeMark } from "@aigc-flow/shared";
import { Check, Copy, Download, Maximize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type DownloadItem, downloadMedia } from "@/lib/download";
import { cn } from "@/lib/utils";

/**
 * 面板离节点右边缘的距离（屏幕像素）：要越过骑在边上的 source 端点再留点空。
 * 端点中心在边外 10px、半径 10，都是按 1/zoom 反向缩放的屏幕尺寸，所以这段间距也按
 * 屏幕像素算（除以 zoom 换成画布单位），画布缩小时面板才不会压到端点上。
 */
const PANEL_GAP = 24;

/**
 * 单击图像 / 视频生成节点后浮在结果区右侧的功能面板：下载、全屏（在新标签页打开原图）、
 * 原样复制（连同上游连线，见 canvasActions.duplicateNode）、
 * 采用 / 废弃两个标记开关（点已激活的那个就清除）。
 * 多选工具条的批量下载要求至少选两个（排布、编组那几个按钮对单个节点没意义），
 * 单个节点的下载入口就落在这里。
 * 和下方的 prompt 菜单同款：用 1/zoom 反向缩放在屏幕上保持固定大小，
 * 挂在 relative 的结果区容器里、top 对齐结果区顶边。
 */
export function NodeActionPanel({
  item,
  zoom,
  mark,
  onMark,
  onDuplicate,
}: {
  item: DownloadItem;
  zoom: number;
  mark: NodeMark | null;
  onMark: (mark: NodeMark | null) => void;
  onDuplicate: () => void;
}) {
  return (
    <div
      className="nodrag absolute top-0 flex flex-col gap-1 rounded-xl border bg-card p-1 shadow-sm"
      style={{
        left: `calc(100% + ${PANEL_GAP / zoom}px)`,
        transform: `scale(${1 / zoom})`,
        transformOrigin: "top left",
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="下载"
            onClick={() => void downloadMedia([item])}
          >
            <Download />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">下载</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="全屏查看"
            onClick={() => window.open(item.url, "_blank", "noopener")}
          >
            <Maximize2 />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">全屏查看</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="原样复制"
            onClick={(event) => {
              // 复制会把 active 切到副本上；click 再冒泡到节点会触发 React Flow 的
              // onNodeClick，把 active 设回原节点，副本的面板和菜单就出不来了
              event.stopPropagation();
              onDuplicate();
            }}
          >
            <Copy />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">原样复制（含上游连线）</TooltipContent>
      </Tooltip>

      <div className="mx-1 border-t" />

      <MarkToggle value="keep" current={mark} onMark={onMark} icon={Check} />
      <MarkToggle value="reject" current={mark} onMark={onMark} icon={X} />
    </div>
  );
}

/** 标记开关：激活时按标记配色（采用绿、废弃灰），和角标同一套颜色 */
function MarkToggle({
  value,
  current,
  onMark,
  icon: Icon,
}: {
  value: NodeMark;
  current: NodeMark | null;
  onMark: (mark: NodeMark | null) => void;
  icon: typeof Check;
}) {
  const active = current === value;
  const label = active ? `取消${NODE_MARK_LABEL[value]}` : `标记为${NODE_MARK_LABEL[value]}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-pressed={active}
          onClick={() => onMark(active ? null : value)}
          className={cn(
            active &&
              (value === "keep"
                ? "bg-emerald-500 text-white hover:bg-emerald-500/90 hover:text-white"
                : "bg-muted-foreground text-background hover:bg-muted-foreground/90 hover:text-background"),
          )}
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
