"use client";

import type { Project } from "@aigc-flow/shared";
import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { API_BASE, api } from "@/lib/api";

type Health = { status: string; db: string; dbPath: string; uptime: number };

export function DebugConsole() {
  const [health, setHealth] = useState<Health | null>(null);
  // 页面和后端各自的实际地址。只能在 effect 里读 window：这个组件在静态导出时
  // 会被预渲染，render 期间读 window.location 两边对不上会 hydration 报错
  const [origins, setOrigins] = useState<{ client: string; server: string } | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthRes, listRes] = await Promise.all([
        api.api.health.$get(),
        api.api.projects.$get(),
      ]);
      if (!healthRes.ok || !listRes.ok) throw new Error("接口返回异常");
      setHealth(await healthRes.json());
      setProjects(await listRes.json());
    } catch {
      setError(
        API_BASE
          ? `连不上后端，确认 apps/server 已在 ${API_BASE} 启动`
          : "连不上内嵌的服务，重启应用试试；日志在应用数据目录的 logs/main.log",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const client = window.location.host;
    // API_BASE 为空串就是同源（桌面端由内嵌的 Hono 一起托管），否则解析出独立 server 的 host
    setOrigins({ client, server: API_BASE ? new URL(API_BASE).host : client });
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    if (!name) return;

    setSubmitting(true);
    try {
      const res = await api.api.projects.$post({
        json: { name },
      });
      if (!res.ok) throw new Error("创建失败");
      form.reset();
      await load();
    } catch {
      setError("创建失败，检查后端日志");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    const res = await api.api.projects[":id"].$delete({ param: { id: String(id) } });
    if (res.ok) setProjects((prev) => prev.filter((w) => w.id !== id));
  }

  const online = health?.status === "ok" && health?.db === "ok";

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              链路自检
              <Badge variant={online ? "default" : "destructive"}>
                {loading ? "检测中" : online ? "全链路正常" : "异常"}
              </Badge>
            </CardTitle>
            <CardDescription>client → server → SQLite</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <StatusRow label="Next.js client" value={origins?.client ?? "…"} ok />
            <StatusRow
              label="Hono server"
              value={origins?.server ?? "…"}
              ok={health?.status === "ok"}
            />
            <StatusRow label="SQLite" value={health?.dbPath ?? "…"} ok={health?.db === "ok"} />
            <Separator className="my-3" />
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={loading ? "animate-spin" : ""} />
              重新检测
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">新建项目</CardTitle>
            <CardDescription>写入 SQLite，验证读写与 zod 校验</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-3">
              <Input name="name" placeholder="项目名称" maxLength={100} required />
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? <Loader2 className="animate-spin" /> : <Plus />}
                创建
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">项目列表</CardTitle>
          <CardDescription>
            {loading ? "加载中…" : `共 ${projects.length} 条，来自 SQLite`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm">
              {error}
            </p>
          )}
          {!loading && projects.length === 0 && !error && (
            <p className="py-10 text-center text-muted-foreground text-sm">
              还没有项目，先在左侧创建一条
            </p>
          )}
          {projects.map((project) => (
            <div
              key={project.id}
              className="flex items-start justify-between gap-4 rounded-lg border p-4"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{project.name}</p>
                <p className="mt-1 text-muted-foreground text-xs">创建于 {project.createdAt}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`删除 ${project.name}`}
                onClick={() => handleDelete(project.id)}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 font-mono text-xs">
        {value}
        <span
          className={`size-2 rounded-full ${ok ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
        />
      </span>
    </div>
  );
}
