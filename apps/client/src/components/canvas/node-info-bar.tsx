"use client";

import type { LucideIcon } from "lucide-react";
import { NodeName } from "./node-name";
import { NodeSizeLabel } from "./node-size";

/** 信息条在屏幕上的最小宽度（px），够放一个中等长度的文件名加尺寸 */
const MIN_WIDTH = 220;

/**
 * 选中时浮在节点上方外侧的信息条：左边图标 + 名称（双击可改），右边原始像素尺寸。
 * 媒体 / 图像生成 / 视频生成三种节点共用。
 *
 * 和下方的 prompt 菜单、右侧的功能面板同一套缩放逻辑：用 1/zoom 反向缩放，
 * 画布缩小时文字在屏幕上仍是原大小，看得清。宽度按 zoom 等比收窄，放大回去后
 * 正好铺满节点宽度；但屏幕上至少留 MIN_WIDTH，否则画布缩得很小时名字会被截到
 * 一个字不剩 —— 这时信息条会伸出节点右边，和 prompt 菜单超出节点宽度同语义。
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
      className="pointer-events-none absolute bottom-full left-0 flex items-center justify-between gap-4 pb-1.5 text-xs"
      style={{
        color: accent,
        width: `max(${zoom * 100}%, ${MIN_WIDTH}px)`,
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
