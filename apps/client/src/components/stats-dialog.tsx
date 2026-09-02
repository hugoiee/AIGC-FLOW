"use client";

import { ChartColumn } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api";

type GenerationsPayload = {
  stats: {
    imageTotal: number;
    imageSuccess: number;
    videoTotal: number;
    videoSuccess: number;
    videoSeconds: number;
    videoAutoCount: number;
  };
  items: Array<{
    id: number;
    kind: string;
    payload: string;
    status: string;
    error: string | null;
    resultUrl: string | null;
    durationSeconds: number | null;
    createdAt: string;
  }>;
};

/** payload 里的 prompt 摘要，列表一行放得下的长度 */
function promptOf(payload: string): string {
  try {
    const parsed = JSON.parse(payload) as { prompt?: string };
    return parsed.prompt ?? "";
  } catch {
    return "";
  }
}

function prettyJson(payload: string): string {
  try {
    return JSON.stringify(JSON.parse(payload), null, 2);
  } catch {
    return payload;
  }
}

/**
 * 生成数据统计面板：次数汇总（成本核算用）+ 每次请求的明细
 * （发出去的完整 JSON、状态、结果 / 失败原因）。
 * 只看当前项目（画布）的流水：开销按项目核算，别的画布的不混进来。
 */
export function StatsDialog({ projectId }: { projectId: number }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<GenerationsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) return;
    setError(null);
    api.api.generations
      .$get({ query: { projectId: String(projectId) } })
      .then((res) => {
        if (!res.ok) throw new Error(`读取统计失败（${res.status}）`);
        return res.json();
      })
      .then((payload) => setData(payload))
      .catch(() => setError("读取统计失败，确认 server 已启动"));
  };

  const stats = data?.stats;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="数据统计">
              <ChartColumn />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">数据统计</TooltipContent>
      </Tooltip>

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>数据统计</DialogTitle>
          <DialogDescription>本项目的生成次数与请求明细，成功失败都会记录。</DialogDescription>
        </DialogHeader>

        {error && <p className="text-destructive text-sm">{error}</p>}

        {stats && (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border p-3">
              <p className="text-muted-foreground text-xs">图像生成</p>
              <p className="mt-1 font-semibold text-2xl tabular-nums">{stats.imageSuccess}</p>
              <p className="text-muted-foreground text-xs">成功 / 共 {stats.imageTotal} 次</p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="text-muted-foreground text-xs">视频生成</p>
              <p className="mt-1 font-semibold text-2xl tabular-nums">{stats.videoSuccess}</p>
              <p className="text-muted-foreground text-xs">成功 / 共 {stats.videoTotal} 次</p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="text-muted-foreground text-xs">视频总时长</p>
              <p className="mt-1 font-semibold text-2xl tabular-nums">{stats.videoSeconds}s</p>
              <p className="text-muted-foreground text-xs">
                {stats.videoAutoCount > 0
                  ? `另有 ${stats.videoAutoCount} 次自动时长未计入`
                  : "按请求时长合计"}
              </p>
            </div>
          </div>
        )}

        <div className="max-h-[50vh] space-y-1 overflow-y-auto pr-1">
          {data?.items.length === 0 && (
            <p className="py-6 text-center text-muted-foreground text-sm">还没有生成记录</p>
          )}
          {data?.items.map((item) => (
            <details key={item.id} className="group rounded-lg border">
              <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
                <Badge variant={item.status === "success" ? "secondary" : "destructive"}>
                  {item.status === "success" ? "成功" : "失败"}
                </Badge>
                <span className="shrink-0 text-muted-foreground text-xs">
                  {item.kind === "image" ? "图像" : "视频"}
                  {item.kind === "video" &&
                    item.durationSeconds != null &&
                    `（${item.durationSeconds === -1 ? "自动" : `${item.durationSeconds}s`}）`}
                </span>
                <span className="min-w-0 flex-1 truncate">{promptOf(item.payload)}</span>
                <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                  {new Date(item.createdAt).toLocaleString()}
                </span>
              </summary>
              <div className="space-y-2 border-t px-3 py-2">
                {item.error && <p className="text-destructive text-xs">{item.error}</p>}
                {item.resultUrl && (
                  <p className="break-all text-muted-foreground text-xs">结果：{item.resultUrl}</p>
                )}
                <pre className="max-h-60 overflow-auto rounded-md bg-muted p-2 text-xs leading-relaxed">
                  {prettyJson(item.payload)}
                </pre>
              </div>
            </details>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
