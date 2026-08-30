"use client";

import { NodeToolbar, Position } from "@xyflow/react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  ChevronDown,
  Download,
  Group,
  LayoutGrid,
  StretchHorizontal,
  StretchVertical,
  Ungroup,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type AlignMode, DISTRIBUTE_MIN, LAYOUT_GAP, type SpacingMode } from "@/lib/layout";

/**
 * 选中这么多个节点才出现工具条。
 * 1 个节点谈不上对齐和分布，节点自己的缩放框已经够用了。
 */
export const SELECTION_TOOLBAR_MIN = 2;

const ALIGN_ITEMS: Array<{ mode: AlignMode; label: string; icon: typeof AlignStartVertical }> = [
  { mode: "left", label: "左对齐", icon: AlignStartVertical },
  { mode: "centerX", label: "水平居中", icon: AlignCenterVertical },
  { mode: "right", label: "右对齐", icon: AlignEndVertical },
  { mode: "top", label: "顶部对齐", icon: AlignStartHorizontal },
  { mode: "centerY", label: "垂直居中", icon: AlignCenterHorizontal },
  { mode: "bottom", label: "底部对齐", icon: AlignEndHorizontal },
];

const SPACING_ITEMS: Array<{
  mode: SpacingMode;
  label: string;
  icon: typeof AlignHorizontalSpaceAround;
  /** 等距分布要两端固定、中间摊开，少于 3 个没有可分的空隙 */
  needsThree: boolean;
}> = [
  {
    mode: "distributeX",
    label: "水平等距分布",
    icon: AlignHorizontalSpaceAround,
    needsThree: true,
  },
  { mode: "distributeY", label: "垂直等距分布", icon: AlignVerticalSpaceAround, needsThree: true },
  {
    mode: "packX",
    label: `横向收拢至 ${LAYOUT_GAP}px`,
    icon: StretchHorizontal,
    needsThree: false,
  },
  { mode: "packY", label: `纵向收拢至 ${LAYOUT_GAP}px`, icon: StretchVertical, needsThree: false },
];

type SelectionToolbarProps = {
  selectedIds: string[];
  /** 选区正好是一个编组时的编组 id，工具条据此切到「解组」形态 */
  groupId: string | null;
  /** 选区能不能编组。不能的原因只有一个：里面已经有编组或组内节点（暂不支持嵌套） */
  canGroup: boolean;
  onGroup: () => void;
  onUngroup: () => void;
  onArrange: () => void;
  onAlign: (mode: AlignMode) => void;
  onSpace: (mode: SpacingMode) => void;
  onDownload: () => void;
  /** 选区里能下载的素材数量。普通节点和还没传完的媒体不算 */
  downloadCount: number;
};

/**
 * 多选时浮在选区上方的操作条。
 *
 * 位置交给 React Flow 的 NodeToolbar：传一组 nodeId 进去，它会自己算这批节点的
 * 包围盒并跟着缩放 / 平移走，不用我们自己把画布坐标换算成屏幕坐标。
 * offset 要躲开节点自己的信息条（在节点上方 24px 处）。
 */
export function SelectionToolbar({
  selectedIds,
  groupId,
  canGroup,
  onGroup,
  onUngroup,
  onArrange,
  onAlign,
  onSpace,
  onDownload,
  downloadCount,
}: SelectionToolbarProps) {
  // 两种形态：选中一个编组时只提供解组 + 下载；选中多个普通节点时是排布那一套
  const isGroup = groupId !== null;
  if (!isGroup && selectedIds.length < SELECTION_TOOLBAR_MIN) return null;

  return (
    <NodeToolbar
      nodeId={selectedIds}
      isVisible
      position={Position.Top}
      offset={36}
      className="flex items-center gap-0.5 rounded-xl border bg-background/90 p-1 shadow-lg backdrop-blur-sm"
    >
      {isGroup ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={onUngroup}>
              <Ungroup />
              解组
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">拆掉编组，成员留在原地</TooltipContent>
        </Tooltip>
      ) : (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={onArrange}>
                <LayoutGrid />
                整理节点
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">按阅读顺序重排成等距网格</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              {/* disabled 的按钮不派发鼠标事件，tooltip 收不到 hover，套一层 span 承接 */}
              <span className="inline-flex">
                <Button variant="ghost" size="sm" disabled={!canGroup} onClick={onGroup}>
                  <Group />
                  创建编组
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              {canGroup ? "把选中的节点框成一组" : "选区里含编组或组内节点，暂不支持嵌套编组"}
            </TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="!h-5 mx-1" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" aria-label="对齐方式">
                <AlignStartVertical />
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" side="top">
              {ALIGN_ITEMS.map(({ mode, label, icon: Icon }) => (
                <DropdownMenuItem key={mode} onSelect={() => onAlign(mode)}>
                  <Icon />
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" aria-label="间距调整">
                <AlignHorizontalSpaceAround />
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" side="top">
              {SPACING_ITEMS.map(({ mode, label, icon: Icon, needsThree }) => (
                <DropdownMenuItem
                  key={mode}
                  disabled={needsThree && selectedIds.length < DISTRIBUTE_MIN}
                  onSelect={() => onSpace(mode)}
                >
                  <Icon />
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}

      <Separator orientation="vertical" className="!h-5 mx-1" />

      <Tooltip>
        <TooltipTrigger asChild>
          {/* disabled 的按钮不派发鼠标事件，tooltip 收不到 hover，套一层 span 承接 */}
          <span className="inline-flex">
            <Button
              variant="ghost"
              size="sm"
              disabled={downloadCount === 0}
              onClick={onDownload}
              aria-label="批量下载"
            >
              <Download />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          {downloadCount === 0 ? "选区里没有可下载的素材" : `批量下载 ${downloadCount} 个素材`}
        </TooltipContent>
      </Tooltip>
    </NodeToolbar>
  );
}
