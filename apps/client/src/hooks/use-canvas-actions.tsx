"use client";

import type { NodeMark } from "@aigc-flow/shared";
import { createContext, type ReactNode, useContext } from "react";

/**
 * 自定义节点反向调用画布的操作。
 *
 * 节点组件是通过模块级的 nodeTypes 注册的，拿不到 CanvasEditor 的闭包；
 * 而 useReactFlow 的 updateNodeData 只改 React Flow 自己的 store，
 * 绕过了撤销栈。所以「节点内发起、但要进历史」的操作统一走这里。
 */
type CanvasActions = {
  /** 当前画布所属的项目 id。生成请求带上它，流水按项目归属、统计面板按项目过滤 */
  projectId: number;
  /** 改节点名称，会进撤销栈 */
  renameNode: (nodeId: string, label: string) => void;
  /** 给节点打标（null 清除），会进撤销栈。只对身上有素材的节点生效 */
  setNodeMark: (nodeId: string, mark: NodeMark | null) => void;
  /**
   * 原样复制节点：同 type / data / 尺寸 / 所属编组，位置错开一点；
   * 从上游过来的连线也照抄一份接到副本上（上游节点本身不复制）。会进撤销栈。
   */
  duplicateNode: (nodeId: string) => void;
  /**
   * 最近一次被单击的节点 id。用来区分「单击选中」和「框选 / 批量选中」：
   * 图像生成节点的配置菜单只在单击时展开，框选中不展开。
   */
  activeNodeId: string | null;
  /**
   * 拖线悬停中的可放置目标节点 id。只有能接受当前连线的节点才会被设上，
   * 生成节点据此播放「可放置」动画；松手或悬到不能接受的节点时为 null。
   */
  dropTargetId: string | null;
};

const CanvasActionsContext = createContext<CanvasActions | null>(null);

export function CanvasActionsProvider({
  value,
  children,
}: {
  value: CanvasActions;
  children: ReactNode;
}) {
  return <CanvasActionsContext.Provider value={value}>{children}</CanvasActionsContext.Provider>;
}

export function useCanvasActions(): CanvasActions {
  const actions = useContext(CanvasActionsContext);
  if (!actions) throw new Error("useCanvasActions 必须在 CanvasActionsProvider 内使用");
  return actions;
}
