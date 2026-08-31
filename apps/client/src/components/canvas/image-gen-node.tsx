"use client";

import {
  GPT_QUALITIES,
  GPT_SIZE_PRESETS,
  gptSizeOf,
  IMAGE_GEN_NODE_TYPE,
  IMAGE_GEN_NODE_WIDTH,
  IMAGE_MODELS,
  type ImageGenNodeData,
  imageModelOf,
  MAX_REFERENCE_IMAGES,
  MEDIA_NODE_TYPE,
  type MediaNodeData,
  NANO_ASPECT_RATIOS,
  NANO_IMAGE_SIZES,
} from "@aigc-flow/shared";
import {
  Handle,
  type NodeProps,
  Position,
  useNodeConnections,
  useNodesData,
  useReactFlow,
  useStore,
} from "@xyflow/react";
import { ChevronDown, CircleAlert, ImageIcon, Loader2, Plus, WandSparkles } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCanvasActions } from "@/hooks/use-canvas-actions";
import { api } from "@/lib/api";
import { CANVAS_WIDTH, resizedImageUrl, THUMB_WIDTH } from "@/lib/media-url";
import { cn } from "@/lib/utils";
import { GEN_ACCENT, GEN_HANDLE_BASE, PillOption, RatioOption } from "./gen-node-controls";
import { ModelIcon } from "./model-icon";
import { NodeName } from "./node-name";
import { PromptEditor, usePromptTokens } from "./prompt-editor";

/** 占位区的宽高比跟随当前选择的比例；gpt 的 auto 档没有具体比例，退回 16:9 */
function currentAspect(gen: ImageGenNodeData): number {
  if (gen.model === "gpt-image-2") {
    const preset = gptSizeOf(gen.sizePreset);
    return preset.width > 0 ? preset.width / preset.height : 16 / 9;
  }
  const [w = 16, h = 9] = gen.aspectRatio.split(":").map(Number);
  return w / h;
}

/**
 * 从上游节点里取出能作为参考图的 URL：
 * 图片媒体节点的 url，或另一个图像生成节点的结果图 —— 生成结果可以链式引用。
 */
export function referenceUrlOf(node: { type?: string; data: unknown }): string | null {
  if (node.type === MEDIA_NODE_TYPE) {
    const media = node.data as MediaNodeData;
    return media.kind === "image" && media.status === "ready" && media.url ? media.url : null;
  }
  if (node.type === IMAGE_GEN_NODE_TYPE) {
    const gen = node.data as ImageGenNodeData;
    return gen.status === "ready" && gen.resultUrl ? gen.resultUrl : null;
  }
  return null;
}

export function ImageGenNode({ id, data, selected }: NodeProps) {
  const gen = data as unknown as ImageGenNodeData;
  const { updateNodeData } = useReactFlow();
  // 画布缩放倍率。下方菜单要在屏幕上保持固定大小，用 1/zoom 反向抵消画布缩放
  const zoom = useStore((state) => state.transform[2]);
  // 配置菜单只在「单击选中」时展开；框选（批量选中）不展开
  const { activeNodeId, dropTargetId, neighborIds } = useCanvasActions();
  // 有直接连线的节点被选中时，本节点显示虚线高亮
  const isNeighbor = !selected && neighborIds.has(id);
  const showMenu = Boolean(selected) && activeNodeId === id;
  // 拖线悬停且本节点能接受时播放「可放置」动画
  const isDropTarget = dropTargetId === id;

  // 左侧入边连着的上游节点 → 参考图列表。连线增删时这两个 hook 会自动触发重渲
  const connections = useNodeConnections({ handleType: "target" });
  const sources = useNodesData(connections.map((connection) => connection.source));
  const { badges, resolvedPrompt } = usePromptTokens(id, gen.prompt, sources);
  // id 是源节点 id：同一张图可以连入多次，chips 的 React key 必须用它而不是 url
  const referenceItems = sources
    .map((node) => {
      const url = node ? referenceUrlOf(node) : null;
      return node && url ? { id: node.id, url } : null;
    })
    .filter((item): item is { id: string; url: string } => item !== null);
  const referenceUrls = referenceItems.map((item) => item.url);

  const generating = gen.status === "generating";

  /**
   * 点生成：状态机 idle/ready/error → generating → ready | error。
   * 内网接口同步阻塞，这个请求可能要等几十秒到几分钟。
   */
  async function handleGenerate() {
    if (generating) return;
    updateNodeData(id, { status: "generating", error: undefined });

    try {
      const res = await api.api.generate.$post({
        json: {
          model: gen.model,
          prompt: resolvedPrompt,
          imageList: referenceUrls.slice(0, MAX_REFERENCE_IMAGES),
          quality: gen.quality,
          sizePreset: gen.sizePreset,
          aspectRatio: gen.aspectRatio,
          imageSize: gen.imageSize,
        },
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        const message = body?.message ?? `生成失败（${res.status}）`;
        toast.error("图像生成失败", { description: message });
        updateNodeData(id, { status: "error", error: message });
        return;
      }

      const { url } = (await res.json()) as { url: string };
      updateNodeData(id, { status: "ready", resultUrl: url, error: undefined });
    } catch {
      toast.error("图像生成失败", { description: "连不上服务，确认 server 已启动" });
      updateNodeData(id, { status: "error", error: "连不上服务，确认 server 已启动" });
    }
  }

  return (
    <>
      {selected && (
        <div
          className="-top-6 pointer-events-none absolute inset-x-0 flex items-center text-xs"
          style={{ color: GEN_ACCENT }}
        >
          <span className="flex min-w-0 items-center gap-1">
            <WandSparkles className="size-3.5 shrink-0" />
            <NodeName nodeId={id} label={gen.label} />
          </span>
        </div>
      )}

      <div className="flex flex-col gap-4" style={{ width: IMAGE_GEN_NODE_WIDTH }}>
        {/*
          连接端点挂在占位符容器上（relative 定位的这层），垂直居中于占位符两侧，
          菜单在下方展开 / 收起都不会影响端点位置。端点不能放进 overflow-hidden
          那层，会被圆角裁掉，所以套了两层。
        */}
        <motion.div
          className="relative"
          animate={isDropTarget ? { scale: [1, 1.02, 1] } : { scale: 1 }}
          transition={
            isDropTarget
              ? { duration: 0.9, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }
              : { duration: 0.15 }
          }
        >
          <div
            className={cn(
              "w-full overflow-hidden rounded-md",
              selected && "outline outline-1 outline-[#3b82f6]",
              isNeighbor && "outline outline-2 outline-[#3b82f6]/80 outline-dashed",
              isDropTarget && "outline outline-2 outline-[#3b82f6]",
            )}
          >
            <ResultArea gen={gen} aspect={currentAspect(gen)} />
          </div>

          {/* 左入右出。target 常显：从别的节点拖连线过来时本节点未被选中，
              端点藏起来就没地方落线了。source 与媒体节点同款，选中才露出 */}
          <Handle type="target" position={Position.Left} style={{ ...GEN_HANDLE_BASE, left: -10 }}>
            <Plus className="pointer-events-none size-3" />
          </Handle>
          <Handle
            type="source"
            position={Position.Right}
            style={{
              ...GEN_HANDLE_BASE,
              right: -10,
              opacity: selected ? 1 : 0,
              pointerEvents: selected ? "auto" : "none",
            }}
          >
            <Plus className="pointer-events-none size-3" />
          </Handle>
        </motion.div>

        {/*
          配置菜单单击节点才展开（框选不展开）。外层用 1/zoom 反向缩放让它在屏幕上
          恒定大小 —— transform 不改变布局盒，缩小画布时菜单会视觉上超出节点宽度，
          这是预期行为（和选中工具条一类的固定 UI 同语义）。
        */}
        {showMenu && (
          <div style={{ transform: `scale(${1 / zoom})`, transformOrigin: "top center" }}>
            <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm">
              <ReferenceChips items={referenceItems} />

              <PromptEditor
                value={gen.prompt}
                badges={badges}
                onChange={(value) => updateNodeData(id, { prompt: value })}
                placeholder="今天我们要创作什么？"
              />

              <div className="flex items-center justify-between gap-2">
                <SizeSetting nodeId={id} gen={gen} />
                <div className="flex items-center gap-2">
                  <ModelSelect nodeId={id} gen={gen} />
                  <Button
                    size="sm"
                    className="nodrag rounded-full px-5"
                    disabled={generating || !resolvedPrompt}
                    onClick={handleGenerate}
                  >
                    {generating && <Loader2 className="animate-spin" />}
                    {generating ? "生成中" : "生成"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * 上方结果区：占位 → 生成中 → 结果图 / 失败。
 * 拉满节点宽度，占位比例跟随图像设置里选的宽高比；结果图按自身比例展示。
 */
function ResultArea({ gen, aspect }: { gen: ImageGenNodeData; aspect: number }) {
  // 结果图地址失效（内网结果有有效期）时兜底成占位符，避免破图 + 大段 alt 文字
  const [loadFailed, setLoadFailed] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 依赖 url 正是为了在换地址时重置
  useEffect(() => setLoadFailed(false), [gen.resultUrl]);

  if (gen.status === "ready" && gen.resultUrl && !loadFailed) {
    return (
      // biome-ignore lint/performance/noImgElement: 生成结果是任意远程图片，无需 next/image
      <img
        src={resizedImageUrl(gen.resultUrl, CANVAS_WIDTH)}
        alt={gen.prompt || gen.label}
        draggable={false}
        loading="lazy"
        decoding="async"
        onError={() => setLoadFailed(true)}
        // 画布上渲染的是缩略版，双击才在新标签页看全尺寸原图
        onDoubleClick={() => gen.resultUrl && window.open(gen.resultUrl, "_blank")}
        className="w-full select-none"
      />
    );
  }

  if (loadFailed) {
    return (
      <div
        className="flex w-full flex-col items-center justify-center gap-1.5 bg-[#e6e6e6] text-muted-foreground/70 dark:bg-muted"
        style={{ aspectRatio: aspect }}
      >
        <ImageIcon className="size-6" strokeWidth={1.5} />
        <span className="text-[10px] opacity-70">结果图已失效，可重新生成</span>
      </div>
    );
  }

  if (gen.status === "error") {
    return (
      <div
        className="flex w-full flex-col items-center justify-center gap-1.5 border border-destructive/60 border-dashed bg-destructive/5 px-4 text-center text-destructive text-xs"
        style={{ aspectRatio: aspect }}
      >
        <CircleAlert className="size-5" />
        <span className="line-clamp-3">{gen.error ?? "生成失败"}</span>
      </div>
    );
  }

  return (
    <div
      // 占位底色浅色下用 #E6E6E6（画布底已是 #F5F5F5，muted 会融进去看不出边界）
      className="flex w-full flex-col items-center justify-center gap-2 bg-[#e6e6e6] text-muted-foreground/50 dark:bg-muted"
      style={{ aspectRatio: aspect }}
    >
      {gen.status === "generating" ? (
        <>
          <Loader2 className="size-8 animate-spin" />
          <span className="text-xs">生成中，请耐心等待…</span>
        </>
      ) : (
        <ImageIcon className="size-14" strokeWidth={1.25} />
      )}
    </div>
  );
}

/** 参考图横排：已连接的缩略图（上限 16），未满时只补一个占位示例格 */
function ReferenceChips({ items }: { items: Array<{ id: string; url: string }> }) {
  const shown = items.slice(0, MAX_REFERENCE_IMAGES);

  return (
    <div className="nodrag nowheel flex gap-2 overflow-x-auto pb-1">
      {shown.map(({ id, url }) => (
        <div key={id} className="h-[68px] w-[56px] shrink-0 overflow-hidden rounded-lg border">
          {/* biome-ignore lint/performance/noImgElement: 画布素材缩略图，无需 next/image */}
          <img
            src={resizedImageUrl(url, THUMB_WIDTH)}
            alt="参考图"
            draggable={false}
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        </div>
      ))}
      {shown.length < MAX_REFERENCE_IMAGES && (
        <div className="flex h-[68px] w-[56px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg border bg-muted/40 text-muted-foreground/60">
          <ImageIcon className="size-5" strokeWidth={1.5} />
          <span className="text-[10px]">参考图</span>
        </div>
      )}
    </div>
  );
}

/**
 * 底部左侧：图像设置弹层。gpt 配质量 + 尺寸档（对齐设计稿的「图像设置」面板），
 * nano 配分辨率 + 宽高比 —— 两家接口的 config 形状不同，弹层内容跟着模型切换。
 */
function SizeSetting({ nodeId, gen }: { nodeId: string; gen: ImageGenNodeData }) {
  const { updateNodeData } = useReactFlow();
  const isGpt = gen.model === "gpt-image-2";
  const label = isGpt
    ? `${qualityLabel(gen.quality)} · ${gen.sizePreset}`
    : `${gen.aspectRatio} · ${gen.imageSize}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="nodrag rounded-full">
          {label}
          <ChevronDown className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-4">
        <p className="font-medium text-sm">图像设置</p>

        <section className="space-y-2">
          <p className="text-muted-foreground text-xs">{isGpt ? "质量" : "分辨率"}</p>
          <div className="flex flex-wrap gap-2">
            {isGpt
              ? GPT_QUALITIES.map(({ value, label: text }) => (
                  <PillOption
                    key={value}
                    active={gen.quality === value}
                    onClick={() => updateNodeData(nodeId, { quality: value })}
                  >
                    {text}
                  </PillOption>
                ))
              : NANO_IMAGE_SIZES.map((size) => (
                  <PillOption
                    key={size}
                    active={gen.imageSize === size}
                    onClick={() => updateNodeData(nodeId, { imageSize: size })}
                  >
                    {size}
                  </PillOption>
                ))}
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-muted-foreground text-xs">宽高比</p>
          <div className="grid grid-cols-4 gap-2">
            {isGpt
              ? GPT_SIZE_PRESETS.map((preset) => (
                  <RatioOption
                    key={preset.id}
                    label={preset.id}
                    width={preset.width}
                    height={preset.height}
                    active={gen.sizePreset === preset.id}
                    onClick={() => updateNodeData(nodeId, { sizePreset: preset.id })}
                  />
                ))
              : NANO_ASPECT_RATIOS.map((ratio) => {
                  const [w = 1, h = 1] = ratio.split(":").map(Number);
                  return (
                    <RatioOption
                      key={ratio}
                      label={ratio}
                      width={w}
                      height={h}
                      active={gen.aspectRatio === ratio}
                      onClick={() => updateNodeData(nodeId, { aspectRatio: ratio })}
                    />
                  );
                })}
          </div>
        </section>

        {isGpt && gen.sizePreset !== "auto" && (
          <p className="text-muted-foreground text-xs">
            输出尺寸：{gptSizeOf(gen.sizePreset).width} × {gptSizeOf(gen.sizePreset).height}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** 底部右侧：模型选择，选项对齐设计稿的「图像模型」菜单 */
function ModelSelect({ nodeId, gen }: { nodeId: string; gen: ImageGenNodeData }) {
  const { updateNodeData } = useReactFlow();
  const model = imageModelOf(gen.model);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="nodrag rounded-full">
          <ModelIcon modelId={model.id} />
          {model.label}
          <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      {/* 固定够宽，Nano Banana Pro 这类长名不换行 */}
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuLabel className="text-muted-foreground">图像模型</DropdownMenuLabel>
        {IMAGE_MODELS.map((item) => (
          <DropdownMenuItem
            key={item.id}
            onSelect={() => updateNodeData(nodeId, { model: item.id })}
            className={cn("whitespace-nowrap", item.id === gen.model && "bg-accent")}
          >
            <ModelIcon modelId={item.id} />
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function qualityLabel(quality: ImageGenNodeData["quality"]): string {
  return { auto: "自动", high: "高", medium: "中", low: "低" }[quality];
}
