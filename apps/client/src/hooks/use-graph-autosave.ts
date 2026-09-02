"use client";

import type { ProjectGraph } from "@aigc-flow/shared";
import type { Edge, Node, Viewport } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { isSameGraph, toPersistedGraph } from "@/lib/graph";

export type SaveStatus = "saved" | "dirty" | "saving" | "error";

const DEBOUNCE_MS = 800;

type UseGraphAutosaveArgs = {
  projectId: number;
  nodes: Node[];
  edges: Edge[];
  /** 视口不用进 debounce 的依赖：平移缩放太频繁，只在别的改动落盘时顺带带上 */
  getViewport: () => Viewport;
  initialGraph: ProjectGraph;
};

/**
 * 画布自动保存。
 *
 * 只比较「剥掉瞬时状态后的图」，所以单纯点选节点、hover 不会触发保存。
 * 视口不参与脏检查——否则每次平移缩放都要写库，但保存时会带上最新视口，
 * 这样下次打开还是停在离开时的位置。
 */
export function useGraphAutosave({
  projectId,
  nodes,
  edges,
  getViewport,
  initialGraph,
}: UseGraphAutosaveArgs) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const savedRef = useRef<ProjectGraph>(initialGraph);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 记住最后一次请求的序号，晚发早归的响应不能覆盖新状态
  const requestSeqRef = useRef(0);

  const save = useCallback(async () => {
    const graph = toPersistedGraph(nodes, edges, getViewport());
    if (isSameGraph(graph, savedRef.current)) {
      setStatus("saved");
      return;
    }

    const seq = ++requestSeqRef.current;
    setStatus("saving");
    try {
      const res = await api.api.projects[":id"].graph.$put({
        param: { id: String(projectId) },
        json: graph,
      });
      if (!res.ok) throw new Error("保存失败");
      if (seq !== requestSeqRef.current) return; // 已有更新的请求在飞，别改状态
      savedRef.current = graph;
      setStatus("saved");
    } catch {
      if (seq === requestSeqRef.current) setStatus("error");
    }
  }, [projectId, nodes, edges, getViewport]);

  useEffect(() => {
    const graph = toPersistedGraph(nodes, edges, getViewport());
    if (isSameGraph(graph, savedRef.current)) {
      // 撤销回到已保存状态时也要把脏标记清掉，
      // 否则 status 会一直停在 dirty，beforeunload 永远拦着不让离开。
      // saving 不能被覆盖：那次请求的结果还没回来。
      setStatus((prev) => (prev === "saving" ? prev : "saved"));
      return;
    }

    setStatus("dirty");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void save(), DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [nodes, edges, getViewport, save]);

  // 有未保存内容时关页面拦一下，浏览器会弹自己的确认框
  useEffect(() => {
    if (status === "saved") return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [status]);

  return { status, saveNow: save };
}
