"use client";

import {
  normalizeStoryboardRows,
  type StoryboardNodeData,
  type StoryboardRow,
} from "@aigc-flow/shared";
import { type NodeProps, NodeResizer, useReactFlow, useStore } from "@xyflow/react";
import { Table2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { GEN_ACCENT } from "./gen-node-controls";
import { NodeInfoBar } from "./node-info-bar";
import { StoryboardDialog } from "./storyboard-dialog";
import { StoryboardTable } from "./storyboard-table";

/** 缩放手柄样式，对齐媒体节点和文本节点 */
const RESIZE_HANDLE_STYLE = {
  width: 9,
  height: 9,
  borderRadius: 2,
  border: `1px solid ${GEN_ACCENT}`,
  backgroundColor: "#fff",
} as const;

/**
 * 分镜表节点：画布上就是一张可逐格编辑的表（镜号 / 镜头 / 时长 / 台词 / 表演 /
 * 表演 Prompt / 完整 Prompt），可自由拉伸，页脚的「放大」把整张表放进弹层。
 *
 * 目前**不参与连线**（没有 handle），是一张纯粹的工作表；
 * 逐行建生成节点、整表当 text 连出去这些以后再接。
 */
export function StoryboardNode({ id, data, selected }: NodeProps) {
  const board = data as unknown as StoryboardNodeData;
  const { updateNodeData } = useReactFlow();
  // 信息条要在屏幕上保持固定大小；没选中时没有信息条，返回常量免得跟着缩放重渲
  const zoom = useStore((state) => (selected ? state.transform[2] : 1));
  const [expanded, setExpanded] = useState(false);
  /**
   * 正在生成的目标。放在节点上而不是表格里：节点里和弹层里是两份 StoryboardTable
   * 实例，状态搁在表格里的话，在节点上点了生成、再打开弹层就看不到转圈了。
   */
  const [generating, setGenerating] = useState<"all" | string | null>(null);

  /**
   * 列的语义改过一轮，旧节点会带着老形状的值回来（见 normalizeStoryboardRows）。
   * useMemo + 「没变就返回原数组」两头配合，读一次不会被判定成有改动去存盘。
   */
  const rows = useMemo(() => normalizeStoryboardRows(board.rows ?? []), [board.rows]);

  /**
   * 写回节点。走 updateNodeData 而不是 canvasActions —— 和文本节点的正文一样，
   * 表格内容不进撤销栈（逐字入栈的话按一次 ⌘Z 只退一个字），
   * 由 graph 的自动保存兜住。
   */
  function commit(next: StoryboardRow[]) {
    // 行操作的纯函数在「没变化」时返回原数组，此时不写，免得白白触发一次保存
    if (next === rows) return;
    updateNodeData(id, { rows: next });
  }

  /**
   * 生成表演 Prompt。不传 rowId 是整表，传了只回那一行 —— 但**整表都会送给模型**，
   * 表演有连贯性，只看孤零零一镜生出来的和前后对不上（见 shared 的请求 schema）。
   */
  async function generate(rowId?: string) {
    if (generating !== null) return;

    const targetIndex = rowId ? rows.findIndex((row) => row.id === rowId) : -1;
    if (rowId && targetIndex < 0) return;
    if (rows.length === 0) return;

    setGenerating(rowId ?? "all");
    try {
      const res = await api.api.storyboard["performance-prompts"].$post({
        json: {
          rows: rows.map((row) => ({
            shotNumber: row.shotNumber,
            shot: row.shot,
            duration: row.duration,
            dialogue: row.dialogue,
            performance: row.performance,
          })),
          ...(rowId ? { only: [targetIndex] } : {}),
        },
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        // 入参校验失败时 Hono 回的是 zod 的错误体，里面没有 message ——
        // 不兜底的话提示只剩一个没有原因的「失败」
        toast.error("生成表演 Prompt 失败", {
          description: body?.message ?? `服务返回 ${res.status}`,
        });
        return;
      }

      const { prompts } = await res.json();
      // 按下标写回，不按顺序 —— 模型可能少给或乱序（服务端已经按 index 过滤过一遍）。
      // 读 rows 而不是重新取快照：这中间没有 await，表不会变
      const byIndex = new Map(prompts.map((item) => [item.index, item.prompt]));
      const next = rows.map((row, index) => {
        const prompt = byIndex.get(index);
        return prompt === undefined ? row : { ...row, performancePrompt: prompt };
      });

      commit(next);
      toast.success(`已生成 ${byIndex.size} 镜的表演 Prompt`, {
        description:
          byIndex.size < (rowId ? 1 : rows.length)
            ? "模型少给了几镜，缺的那几行可以单独重新生成"
            : undefined,
      });
    } catch {
      toast.error("生成表演 Prompt 失败", { description: "连不上服务，确认 server 已启动" });
    } finally {
      setGenerating(null);
    }
  }

  return (
    <>
      <NodeResizer
        isVisible={Boolean(selected)}
        color={GEN_ACCENT}
        handleStyle={RESIZE_HANDLE_STYLE}
        lineStyle={{ borderWidth: 0 }}
        minWidth={360}
        minHeight={180}
      />

      {selected && (
        <NodeInfoBar
          nodeId={id}
          label={board.label}
          icon={Table2}
          accent={GEN_ACCENT}
          zoom={zoom}
        />
      )}

      <div
        className={cn(
          "flex size-full flex-col rounded-xl border bg-card p-2 shadow-sm",
          selected && "outline outline-1 outline-[#3b82f6]",
        )}
      >
        <StoryboardTable
          rows={rows}
          onRowsChange={commit}
          onExpand={() => setExpanded(true)}
          onGenerate={generate}
          generating={generating}
        />
      </div>

      <StoryboardDialog
        open={expanded}
        onOpenChange={setExpanded}
        title={board.label}
        rows={rows}
        onRowsChange={commit}
        onGenerate={generate}
        generating={generating}
      />
    </>
  );
}
