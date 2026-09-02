"use client";

import { Download, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type DownloadItem, downloadMedia } from "@/lib/download";

/** 面板离节点右边缘的距离：要越过骑在边上的 source 端点（半径 10）再留点空 */
const PANEL_GAP = 16;

/**
 * 单击图像 / 视频生成节点后浮在结果区右侧的功能面板：下载、全屏（在新标签页打开原图）。
 * 多选工具条的批量下载要求至少选两个（排布、编组那几个按钮对单个节点没意义），
 * 单个节点的下载入口就落在这里。
 * 和下方的 prompt 菜单同款：用 1/zoom 反向缩放在屏幕上保持固定大小，
 * 挂在 relative 的结果区容器里、top 对齐结果区顶边。
 */
export function NodeActionPanel({ item, zoom }: { item: DownloadItem; zoom: number }) {
  return (
    <div
      className="nodrag absolute top-0 flex flex-col gap-1 rounded-xl border bg-card p-1 shadow-sm"
      style={{
        left: `calc(100% + ${PANEL_GAP}px)`,
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
    </div>
  );
}
