"use client";

import { BaseEdge, type EdgeProps, getBezierPath, useStore } from "@xyflow/react";
import { motion } from "motion/react";

/**
 * 默认连线：新连上时用 motion 做一段描边生长动画（pathLength 0 → 1），
 * 画完后交回普通的 BaseEdge。动画只在挂载时播一次，
 * 拖动节点时 path 变化不会重播。
 */
export function AnimatedEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
}: EdgeProps) {
  // 任一端节点被选中时这条线高亮，一眼看出选中节点连着谁
  const isHighlighted = useStore((state) =>
    Boolean(state.nodeLookup.get(source)?.selected || state.nodeLookup.get(target)?.selected),
  );

  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={isHighlighted ? { ...style, stroke: "#3b82f6", strokeWidth: 1.8 } : style}
        markerEnd={markerEnd}
      />
      {/* 盖在默认线上方的描边动画层，播完后透明化，不拦截指针事件 */}
      <motion.path
        d={path}
        fill="none"
        stroke="#3b82f6"
        strokeWidth={1.6}
        strokeLinecap="round"
        pointerEvents="none"
        initial={{ pathLength: 0, opacity: 1 }}
        animate={{ pathLength: 1, opacity: 0 }}
        transition={{
          pathLength: { duration: 0.45, ease: "easeOut" },
          opacity: { delay: 0.55, duration: 0.35 },
        }}
      />
    </>
  );
}
