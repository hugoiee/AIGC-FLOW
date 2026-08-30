"use client";

import type { Project } from "@aigc-flow/shared";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { EmptyProjects } from "@/components/empty-projects";
import { ProjectCard } from "@/components/project-card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.api.projects.$get();
      if (!res.ok) throw new Error("接口返回异常");
      setProjects(await res.json());
      setError(null);
    } catch {
      setError("加载项目列表失败，确认 server 已在 http://localhost:3001 启动");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = useCallback(async (name: string) => {
    const res = await api.api.projects.$post({ json: { name } });
    if (!res.ok) throw new Error("创建失败");
    const created = await res.json();
    // 后端按更新时间倒序返回，新建的一定在最前，本地插入省一次往返
    setProjects((prev) => [created, ...prev]);
  }, []);

  const handleDelete = useCallback(
    async (id: number) => {
      // 先乐观移除，失败再用快照还原，避免界面和数据库不一致
      const snapshot = projects;
      setProjects(snapshot.filter((project) => project.id !== id));

      const res = await api.api.projects[":id"].$delete({ param: { id: String(id) } });
      if (!res.ok) setProjects(snapshot);
    },
    [projects],
  );

  if (loading) {
    return (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((key) => (
          <div key={key} className="overflow-hidden rounded-xl border">
            <div className="aspect-video animate-pulse bg-muted" />
            <div className="space-y-2 p-4">
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-6 py-16 text-center">
        <p className="text-destructive text-sm">{error}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => void load()}>
          重试
        </Button>
      </div>
    );
  }

  if (projects.length === 0) {
    return <EmptyProjects onCreate={handleCreate} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">共 {projects.length} 个项目</p>
        <CreateProjectDialog
          onCreate={handleCreate}
          trigger={
            <Button size="sm">
              <Plus />
              新建项目
            </Button>
          }
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} onDelete={handleDelete} />
        ))}
      </div>
    </div>
  );
}
