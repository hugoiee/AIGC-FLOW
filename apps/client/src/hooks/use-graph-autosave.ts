"use client";

import type { ProjectGraph } from "@aigc-flow/shared";
import type { Edge, Node, Viewport } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { isSameGraph, toPersistedGraph } from "@/lib/graph";
import { SaveQueue } from "@/lib/save-queue";

export type SaveStatus = "saved" | "dirty" | "saving" | "error";
type AutosaveOptions = {
  projectId: number;
  nodes: Node[];
  edges: Edge[];
  getViewport: () => Viewport;
  initialGraph: ProjectGraph;
};
export function useGraphAutosave({
  projectId,
  nodes,
  edges,
  getViewport,
  initialGraph,
}: AutosaveOptions) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const read = useRef(() => toPersistedGraph(nodes, edges, getViewport()));
  read.current = () => toPersistedGraph(nodes, edges, getViewport());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [queue] = useState(
    () =>
      new SaveQueue(
        initialGraph,
        () => read.current(),
        async (graph) => {
          const response = await api.api.projects[":id"].graph.$put({
            param: { id: String(projectId) },
            json: graph,
          });
          if (!response.ok) throw new Error("保存失败");
        },
        isSameGraph,
        setStatus,
      ),
  );
  const saveNow = useCallback(() => {
    clearTimeout(timer.current);
    return queue.flush();
  }, [queue]);
  useEffect(() => {
    clearTimeout(timer.current);
    if (queue.saving) return;
    if (isSameGraph(toPersistedGraph(nodes, edges, getViewport()), queue.saved)) {
      setStatus("saved");
      return;
    }
    setStatus("dirty");
    timer.current = setTimeout(() => void saveNow(), 800);
    return () => clearTimeout(timer.current);
  }, [nodes, edges, getViewport, queue, saveNow]);
  useEffect(() => {
    if (status === "saved") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);
  return { status, saveNow };
}
