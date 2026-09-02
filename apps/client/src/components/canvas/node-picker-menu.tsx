"use client";

import { IMAGE_GEN_NODE_TYPE, TEXT_NODE_TYPE, VIDEO_GEN_NODE_TYPE } from "@aigc-flow/shared";
import type { Node } from "@xyflow/react";
import { Clapperboard, Type, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sourceResourceOf, targetAcceptsOf } from "@/lib/connection";

/** 一次「在这里放个节点」的请求：右键空白或浮动连线落空 / 落错时发起 */
export type NodePickerRequest = {
  /** 菜单锚点（屏幕坐标，即松手 / 右键的位置） */
  screen: { x: number; y: number };
  /** 新节点的画布坐标 */
  flow: { x: number; y: number };
  /** 浮动连线场景：待连过来的源节点 id；右键纯添加场景为空数组 */
  sourceIds: string[];
};

const PICKER_ITEMS = [
  { type: IMAGE_GEN_NODE_TYPE, label: "图像生成", icon: WandSparkles },
  { type: VIDEO_GEN_NODE_TYPE, label: "视频生成", icon: Clapperboard },
  { type: TEXT_NODE_TYPE, label: "文本", icon: Type },
] as const;

export type PickerNodeType = (typeof PICKER_ITEMS)[number]["type"];

/**
 * 松手 / 右键位置弹出的节点选择菜单。
 * 带连线上下文时的可用性：所有选中资源都能被该类型接受才可选
 * （文本节点没有入口，连线场景恒不可选）；纯添加场景三种都可选。
 */
export function NodePickerMenu({
  request,
  nodes,
  onPick,
  onClose,
}: {
  request: NodePickerRequest;
  nodes: Node[];
  onPick: (type: PickerNodeType) => void;
  onClose: () => void;
}) {
  const sources = request.sourceIds
    .map((id) => nodes.find((node) => node.id === id))
    .filter((node): node is Node => node !== undefined);

  function allowedFor(type: PickerNodeType): boolean {
    if (sources.length === 0) return true;
    const accepts = targetAcceptsOf(type);
    if (!accepts) return false;
    return sources.every((node) => {
      const resource = sourceResourceOf(node);
      return resource !== null && accepts.has(resource);
    });
  }

  return (
    <>
      {/* 全屏透明层承接“点别处关闭”；右键也关闭，避免又弹系统菜单 */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 纯遮罩层，键盘用户走菜单按钮的焦点链 */}
      <div
        className="fixed inset-0 z-40"
        onPointerDown={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
      <div
        className="fixed z-50 flex w-36 flex-col gap-0.5 rounded-xl border bg-background/95 p-1 shadow-lg backdrop-blur-sm"
        style={{ left: request.screen.x, top: request.screen.y }}
      >
        <p className="px-2 py-1 text-muted-foreground text-xs">
          {sources.length > 0 ? "连接到新节点" : "添加节点"}
        </p>
        {PICKER_ITEMS.map(({ type, label, icon: Icon }) => (
          <Button
            key={type}
            variant="ghost"
            size="sm"
            className="justify-start"
            disabled={!allowedFor(type)}
            onClick={() => onPick(type)}
          >
            <Icon />
            {label}
          </Button>
        ))}
      </div>
    </>
  );
}
