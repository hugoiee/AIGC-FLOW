"use client";

import type { Edge, Node } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";

type Snapshot = { nodes: Node[]; edges: Edge[] };

const MAX_HISTORY = 50;

/**
 * 画布的撤销 / 重做。
 *
 * 关键取舍：**不是每次 state 变化都入栈。** 拖动一个节点会连续触发几十次
 * position change，全记下来的话按一次 Cmd+Z 只会挪动一个像素。
 * 所以入栈由调用方在「一次操作结束」时显式触发（拖动结束、加节点、连线、删除）。
 */
export function useGraphHistory(initial: Snapshot) {
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const present = useRef<Snapshot>(initial);
  const [counts, setCounts] = useState({ undo: 0, redo: 0 });

  const sync = useCallback(() => {
    setCounts({ undo: past.current.length, redo: future.current.length });
  }, []);

  /** 把当前状态推进历史。在一次完整操作结束后调用 */
  const commit = useCallback(
    (snapshot: Snapshot) => {
      const prev = present.current;
      if (prev.nodes === snapshot.nodes && prev.edges === snapshot.edges) {
        return;
      }

      past.current = [...past.current, prev].slice(-MAX_HISTORY);
      future.current = []; // 有新操作就砍掉重做分支
      present.current = snapshot;
      sync();
    },
    [sync],
  );

  /** 不入栈地更新当前状态（拖动过程中的中间态） */
  const replace = useCallback((snapshot: Snapshot) => {
    present.current = snapshot;
  }, []);

  const undo = useCallback((): Snapshot | null => {
    const prev = past.current.at(-1);
    if (!prev) return null;

    past.current = past.current.slice(0, -1);
    future.current = [present.current, ...future.current].slice(0, MAX_HISTORY);
    present.current = prev;
    sync();
    return prev;
  }, [sync]);

  const redo = useCallback((): Snapshot | null => {
    const next = future.current[0];
    if (!next) return null;

    future.current = future.current.slice(1);
    past.current = [...past.current, present.current].slice(-MAX_HISTORY);
    present.current = next;
    sync();
    return next;
  }, [sync]);

  return {
    commit,
    replace,
    undo,
    redo,
    canUndo: counts.undo > 0,
    canRedo: counts.redo > 0,
  };
}

/** 注册画布快捷键。输入框聚焦时全部让行，否则会吞掉正常的文字编辑 */
export function useCanvasShortcuts(handlers: {
  onUndo: () => void;
  onRedo: () => void;
  onCopy: () => void;
  onPaste: () => void;
}) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? "")) {
        return;
      }

      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;

      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) ref.current.onRedo();
        else ref.current.onUndo();
      } else if (key === "y") {
        event.preventDefault();
        ref.current.onRedo();
      } else if (key === "c") {
        ref.current.onCopy();
      } else if (key === "v") {
        ref.current.onPaste();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
