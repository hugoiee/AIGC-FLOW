"use client";

import type { LucideIcon } from "lucide-react";
import { NodeName } from "./node-name";
import { NodeSizeLabel } from "./node-size";

/** 信息条在屏幕上的最大宽度（px）：名字再长也截在这里，不会横着铺满整个屏幕 */
const MAX_WIDTH = 320;

/**
 * 选中时浮在节点上方外侧的信息条：左边图标 + 名称（双击可改），右边原始像素尺寸
 * （文本节点没有尺寸就只有名称）。媒体 / 图像生成 / 视频生成 / 文本四种节点共用。
 *
 * 和下方的 prompt 菜单、右侧的功能面板同一套缩放逻辑：用 1/zoom 反向缩放，
 * 画布缩小时文字在屏幕上仍是原大小，看得清。宽度不跟节点走 —— 按内容自适应，
 * 只设一个屏幕上的上限：跟节点走的话画布缩小后节点在屏幕上只剩几十像素，
 * 名字和尺寸要么被截光、要么被挤到节点外面老远。所以尺寸紧跟在名字后面，
 * 整条从节点左上角起靠左排，节点再小也是这一小块。
 * 以左下角为缩放原点、底边贴节点顶边，底部 padding 是屏幕上恒定的留白。
 * 整条是 pointer-events-none（不挡住底下的画布），只有名称那一小块单独放行。
 */
export function NodeInfoBar({
  nodeId,
  label,
  icon: Icon,
  accent,
  zoom,
  naturalWidth,
  naturalHeight,
}: {
  nodeId: string;
  label: string;
  icon: LucideIcon;
  accent: string;
  zoom: number;
  naturalWidth?: number;
  naturalHeight?: number;
}) {
  return (
    <div
      className="pointer-events-none absolute bottom-full left-0 flex w-max items-center gap-3 whitespace-nowrap pb-1.5 text-xs"
      style={{
        color: accent,
        maxWidth: MAX_WIDTH,
        transform: `scale(${1 / zoom})`,
        transformOrigin: "bottom left",
      }}
    >
      <span className="flex min-w-0 items-center gap-1">
        <Icon className="size-3.5 shrink-0" />
        <NodeName nodeId={nodeId} label={label} />
      </span>
      <NodeSizeLabel naturalWidth={naturalWidth} naturalHeight={naturalHeight} />
    </div>
  );
}
