"use client";

import { createContext, type ReactNode, useContext } from "react";

/**
 * 自定义节点反向调用画布的操作。
 *
 * 节点组件是通过模块级的 nodeTypes 注册的，拿不到 CanvasEditor 的闭包；
 * 而 useReactFlow 的 updateNodeData 只改 React Flow 自己的 store，
 * 绕过了撤销栈。所以「节点内发起、但要进历史」的操作统一走这里。
 */
type CanvasActions = {
  /** 改节点名称，会进撤销栈 */
  renameNode: (nodeId: string, label: string) => void;
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
