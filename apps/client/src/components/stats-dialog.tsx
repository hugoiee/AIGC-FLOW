"use client";

import { ChartColumn, FileSpreadsheet, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
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
import {
  exportFilenameOf,
  exportGenerationsXlsx,
  type GenerationItem,
} from "@/lib/generations-export";

type GenerationsPayload = {
  stats: {
    imageTotal: number;
    imageSuccess: number;
    videoTotal: number;
    videoSuccess: number;
    videoSeconds: number;
    videoAutoCount: number;
  };
  items: GenerationItem[];
};

/** 导出要全量明细，服务端上限 5000 */
const EXPORT_LIMIT = 5000;
/** 服务端列表的默认截断条数，和 routes/generations.ts 的 LIST_LIMIT 对齐，只用来提示 */
const LIST_LIMIT = 200;

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

/** 两个口径共用一份 query 组装：带 projectId 是本项目，不带是全局 */
function queryOf(projectId: number | undefined, limit?: number) {
  return {
    ...(projectId === undefined ? {} : { projectId: String(projectId) }),
    ...(limit === undefined ? {} : { limit: String(limit) }),
  };
}

/**
 * 生成数据统计面板：次数汇总（成本核算用）+ 每次请求的明细
 * （发出去的完整 JSON、状态、结果 / 失败原因），可导出成 .xlsx。
 *
 * 两个口径共用这一个组件：
 * - 画布右上角传 `projectId`，只看当前项目，开销按项目核算；
 * - 首页的「全局记录」不传，看全部流水（含加项目列之前的老记录和已删项目留下的），
 *   此时明细多一列「项目」，否则看不出哪条属于哪张画布。
 */
export function StatsDialog({ projectId, trigger }: { projectId?: number; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<GenerationsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const global = projectId === undefined;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) return;
    setError(null);
    api.api.generations
      .$get({ query: queryOf(projectId) })
      .then((res) => {
        // 服务端有响应但不是 2xx：多半是它自己出错了（比如数据库没跑迁移），
        // 别和「连不上」混成一句，那会让人去查一个明明在跑的 server
        if (!res.ok) throw new Error(`读取统计失败：服务端返回 ${res.status}，看 server 日志`);
        return res.json();
      })
      .then((payload) => setData(payload))
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "读取统计失败，确认 server 已启动"),
      );
  };

  /**
   * 列表只显示最近 200 条，导出的却应该是全量 —— 否则用户拿到的表格
   * 会悄悄少掉一截。所以导出时按 EXPORT_LIMIT 单独再请求一次，不复用列表数据。
   */
  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const res = await api.api.generations.$get({ query: queryOf(projectId, EXPORT_LIMIT) });
      if (!res.ok) throw new Error(`导出失败：服务端返回 ${res.status}，看 server 日志`);
      const payload = await res.json();
      await exportGenerationsXlsx(payload.items, exportFilenameOf(global ? "全局" : "本项目"));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "导出失败，确认 server 已启动");
    } finally {
      setExporting(false);
    }
  };

  const stats = data?.stats;
  const count = data?.items.length ?? 0;
  const empty = data !== null && count === 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : (
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
      )}

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{global ? "全局生成记录" : "数据统计"}</DialogTitle>
          <DialogDescription>
            {global
              ? "所有项目的生成次数与请求明细，含已删项目留下的记录。"
              : "本项目的生成次数与请求明细，成功失败都会记录。"}
          </DialogDescription>
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

        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-xs">
            明细 {count} 条{count >= LIST_LIMIT && "（已截断到最近 200 条）"}，导出为全量。
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting || !data || empty}
          >
            {exporting ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
            导出 Excel
          </Button>
        </div>

        <div className="max-h-[50vh] space-y-1 overflow-y-auto pr-1">
          {empty && (
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
                {global && (
                  <Badge variant="outline" className="shrink-0 max-w-32 truncate font-normal">
                    {item.projectName ?? "未归属"}
                  </Badge>
                )}
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
