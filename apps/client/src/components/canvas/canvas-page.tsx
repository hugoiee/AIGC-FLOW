"use client";

import type { Project, ProjectGraph } from "@aigc-flow/shared";
import { ReactFlowProvider } from "@xyflow/react";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { fromPersistedGraph } from "@/lib/graph";
import { CanvasEditor } from "./canvas-editor";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; project: Project; graph: ProjectGraph };

export function CanvasPage({ projectId }: { projectId: number }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const param = { id: String(projectId) };
        const [projectRes, graphRes] = await Promise.all([
          api.api.projects[":id"].$get({ param }),
          api.api.projects[":id"].graph.$get({ param }),
        ]);

        if (projectRes.status === 404) {
          if (!cancelled) setState({ status: "error", message: "项目不存在或已被删除" });
          return;
        }
        if (!projectRes.ok || !graphRes.ok) throw new Error("接口返回异常");

        const [project, graph] = await Promise.all([projectRes.json(), graphRes.json()]);
        if (!cancelled) setState({ status: "ready", project, graph });
      } catch {
        if (!cancelled) {
          setState({ status: "error", message: "加载失败，确认 server 已在 3001 端口启动" });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const handleRename = useCallback(
    async (name: string) => {
      const res = await api.api.projects[":id"].$patch({
        param: { id: String(projectId) },
        json: { name },
      });
      if (!res.ok) throw new Error("重命名失败");
      const updated = await res.json();
      setState((prev) => (prev.status === "ready" ? { ...prev, project: updated } : prev));
    },
    [projectId],
  );

  if (state.status === "loading") {
    return (
      <div className="flex h-dvh items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        加载画布…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">{state.message}</p>
        <Button asChild variant="outline">
          <Link href="/">返回项目列表</Link>
        </Button>
      </div>
    );
  }

  const initial = fromPersistedGraph(state.graph);

  return (
    // ReactFlowProvider 必须包在最外层：编辑器内部要用 useReactFlow 拿画布实例
    <ReactFlowProvider>
      <CanvasEditor
        project={state.project}
        initialNodes={initial.nodes}
        initialEdges={initial.edges}
        initialViewport={state.graph.viewport}
        initialGraph={state.graph}
        onRename={handleRename}
      />
    </ReactFlowProvider>
  );
}
