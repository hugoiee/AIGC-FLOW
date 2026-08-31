"use client";

import {
  AUTO_DURATION,
  IMAGE_GEN_NODE_TYPE,
  IMAGE_GEN_NODE_WIDTH,
  type ImageGenNodeData,
  MAX_AUDIO_REFS,
  MAX_FRAME_IMAGES,
  MAX_REFERENCE_IMAGES,
  MAX_VIDEO_REFS,
  MEDIA_NODE_TYPE,
  type MediaKind,
  type MediaNodeData,
  VIDEO_GEN_NODE_TYPE,
  VIDEO_MODES,
  VIDEO_RATIOS,
  VIDEO_VERSIONS,
  type VideoGenNodeData,
  videoVersionOf,
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
import {
  ChevronDown,
  CircleAlert,
  Clapperboard,
  FileVideo,
  ImageIcon,
  Loader2,
  Music,
  Play,
  Plus,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { useCanvasActions } from "@/hooks/use-canvas-actions";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { GEN_ACCENT, GEN_HANDLE_BASE, PillOption, RatioOption } from "./gen-node-controls";
import { NodeName } from "./node-name";
import { PromptEditor, usePromptTokens } from "./prompt-editor";

type ReferenceMedia = { kind: MediaKind; url: string };

/**
 * 从上游节点里取出参考素材及其种类：媒体节点（图 / 视频 / 音频）、
 * 图像生成节点的结果图、视频生成节点的结果视频，都能作为参考。
 */
function referenceMediaOf(node: { type?: string; data: unknown }): ReferenceMedia | null {
  if (node.type === MEDIA_NODE_TYPE) {
    const media = node.data as MediaNodeData;
    return media.status === "ready" && media.url ? { kind: media.kind, url: media.url } : null;
  }
  if (node.type === IMAGE_GEN_NODE_TYPE) {
    const gen = node.data as ImageGenNodeData;
    return gen.status === "ready" && gen.resultUrl ? { kind: "image", url: gen.resultUrl } : null;
  }
  if (node.type === VIDEO_GEN_NODE_TYPE) {
    const gen = node.data as VideoGenNodeData;
    return gen.status === "ready" && gen.resultUrl ? { kind: "video", url: gen.resultUrl } : null;
  }
  return null;
}

/** 占位区宽高比跟随所选比例；adaptive（自适应）没有具体值，退回 16:9 */
function currentAspect(gen: VideoGenNodeData): number {
  if (gen.ratio === "adaptive") return 16 / 9;
  const [w = 16, h = 9] = gen.ratio.split(":").map(Number);
  return w / h;
}

export function VideoGenNode({ id, data, selected }: NodeProps) {
  const gen = data as unknown as VideoGenNodeData;
  const { updateNodeData } = useReactFlow();
  const zoom = useStore((state) => state.transform[2]);
  const { activeNodeId, dropTargetId } = useCanvasActions();
  const showMenu = Boolean(selected) && activeNodeId === id;
  // 拖线悬停且本节点能接受时播放「可放置」动画
  const isDropTarget = dropTargetId === id;

  const connections = useNodeConnections({ handleType: "target" });
  const sources = useNodesData(connections.map((connection) => connection.source));
  const { badges, resolvedPrompt } = usePromptTokens(id, gen.prompt, sources);
  const refs = sources
    .map((node) => referenceMediaOf(node))
    .filter((item): item is ReferenceMedia => item !== null);

  const isFrames = gen.mode === "first_last_frame";
  // 按种类分流到接口的三个入参；首尾帧模式只取前两张图（首帧、尾帧），不支持参考视频
  const imageRefs = refs
    .filter((item) => item.kind === "image")
    .slice(0, isFrames ? MAX_FRAME_IMAGES : MAX_REFERENCE_IMAGES);
  const videoRefs = isFrames
    ? []
    : refs.filter((item) => item.kind === "video").slice(0, MAX_VIDEO_REFS);
  const audioRefs = refs.filter((item) => item.kind === "audio").slice(0, MAX_AUDIO_REFS);

  const generating = gen.status === "generating";

  /** 点生成：同图像节点的状态机。内网接口同步阻塞，视频可能要等几分钟 */
  async function handleGenerate() {
    if (generating) return;
    updateNodeData(id, { status: "generating", error: undefined });

    try {
      const res = await api.api.generate.video.$post({
        json: {
          version: gen.version,
          mode: gen.mode,
          prompt: resolvedPrompt,
          imageList: imageRefs.map((item) => item.url),
          videoList: videoRefs.map((item) => item.url),
          audioList: audioRefs.map((item) => item.url),
          resolution: gen.resolution,
          ratio: gen.ratio,
          duration: gen.duration,
          generateAudio: gen.generateAudio,
        },
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        updateNodeData(id, {
          status: "error",
          error: body?.message ?? `生成失败（${res.status}）`,
        });
        return;
      }

      const { url } = (await res.json()) as { url: string };
      updateNodeData(id, { status: "ready", resultUrl: url, error: undefined });
    } catch {
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
            <Clapperboard className="size-3.5 shrink-0" />
            <NodeName nodeId={id} label={gen.label} />
          </span>
        </div>
      )}

      <div className="flex flex-col gap-4" style={{ width: IMAGE_GEN_NODE_WIDTH }}>
        {/* 端点挂在占位符容器两侧垂直中心，菜单展开收起不影响端点位置（同图像节点） */}
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
              isDropTarget && "outline outline-2 outline-[#3b82f6]",
            )}
          >
            <ResultArea gen={gen} aspect={currentAspect(gen)} />
          </div>

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

        {showMenu && (
          <div style={{ transform: `scale(${1 / zoom})`, transformOrigin: "top center" }}>
            <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm">
              <ReferenceChips refs={[...imageRefs, ...videoRefs, ...audioRefs]} frames={isFrames} />

              <PromptEditor
                value={gen.prompt}
                badges={badges}
                onChange={(value) => updateNodeData(id, { prompt: value })}
                placeholder="今天我们要创作什么？"
              />

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ModeSelect nodeId={id} gen={gen} />
                  <VideoSetting nodeId={id} gen={gen} />
                </div>
                <div className="flex items-center gap-2">
                  <VersionSelect nodeId={id} gen={gen} />
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

/** 上方结果区：占位（播放键，对齐设计稿视频占位符）→ 生成中 → 结果视频 / 失败 */
function ResultArea({ gen, aspect }: { gen: VideoGenNodeData; aspect: number }) {
  const [loadFailed, setLoadFailed] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 依赖 url 正是为了在换地址时重置
  useEffect(() => setLoadFailed(false), [gen.resultUrl]);

  if (gen.status === "ready" && gen.resultUrl && !loadFailed) {
    return (
      // nodrag 让指针事件留给播放器，否则一点播放就变成拖动节点
      <video
        src={gen.resultUrl}
        controls
        preload="metadata"
        onError={() => setLoadFailed(true)}
        className="nodrag w-full"
      >
        <track kind="captions" />
      </video>
    );
  }

  if (loadFailed) {
    return (
      <div
        className="flex w-full flex-col items-center justify-center gap-1.5 bg-[#e6e6e6] text-muted-foreground/70 dark:bg-muted"
        style={{ aspectRatio: aspect }}
      >
        <FileVideo className="size-6" strokeWidth={1.5} />
        <span className="text-[10px] opacity-70">结果视频已失效，可重新生成</span>
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
      className="flex w-full flex-col items-center justify-center gap-2 bg-[#e6e6e6] text-muted-foreground/50 dark:bg-muted"
      style={{ aspectRatio: aspect }}
    >
      {gen.status === "generating" ? (
        <>
          <Loader2 className="size-8 animate-spin" />
          <span className="text-xs">生成中，视频耗时较长，请耐心等待…</span>
        </>
      ) : (
        <Play className="size-12" strokeWidth={1.25} />
      )}
    </div>
  );
}

const CHIP_ICON = { image: ImageIcon, video: FileVideo, audio: Music } as const;

/**
 * 参考素材横排。
 * 参考图模式：图片显示缩略图，视频 / 音频显示种类图标，未满补一个占位示例格。
 * 首尾帧模式：固定「首帧」「尾帧」两格（接口按连入顺序取前两张图）；
 * 音频参考该模式下接口仍支持，照常显示在后面。
 */
function ReferenceChips({ refs, frames }: { refs: ReferenceMedia[]; frames: boolean }) {
  if (frames) {
    const images = refs.filter((item) => item.kind === "image");
    const audios = refs.filter((item) => item.kind === "audio");

    return (
      <div className="nodrag nowheel flex gap-2 overflow-x-auto pb-1">
        {(["首帧", "尾帧"] as const).map((label, index) => {
          const item = images[index];
          return (
            <div
              key={label}
              className="relative h-[68px] w-[56px] shrink-0 overflow-hidden rounded-lg border bg-muted/40"
            >
              {item ? (
                <>
                  {/* biome-ignore lint/performance/noImgElement: 画布素材缩略图，无需 next/image */}
                  <img
                    src={item.url}
                    alt={label}
                    draggable={false}
                    className="size-full object-cover"
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-black/50 py-0.5 text-center text-[10px] text-white">
                    {label}
                  </span>
                </>
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground/60">
                  <ImageIcon className="size-5" strokeWidth={1.5} />
                  <span className="text-[10px]">{label}</span>
                </div>
              )}
            </div>
          );
        })}
        {audios.map(({ url }) => (
          <div
            key={url}
            className="flex h-[68px] w-[56px] shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground"
          >
            <ChipIcon kind="audio" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="nodrag nowheel flex gap-2 overflow-x-auto pb-1">
      {refs.map(({ kind, url }) => (
        <div
          key={url}
          className="flex h-[68px] w-[56px] shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40 text-muted-foreground"
        >
          {kind === "image" ? (
            // biome-ignore lint/performance/noImgElement: 画布素材缩略图，无需 next/image
            <img src={url} alt="参考素材" draggable={false} className="size-full object-cover" />
          ) : (
            <ChipIcon kind={kind} />
          )}
        </div>
      ))}
      <div className="flex h-[68px] w-[56px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg border bg-muted/40 text-muted-foreground/60">
        <ImageIcon className="size-5" strokeWidth={1.5} />
        <span className="text-[10px]">参考素材</span>
      </div>
    </div>
  );
}

function ChipIcon({ kind }: { kind: MediaKind }) {
  const Icon = CHIP_ICON[kind];
  return <Icon className="size-6" strokeWidth={1.5} />;
}

/** 底部最左：参考图模式 / 首尾帧模式 */
function ModeSelect({ nodeId, gen }: { nodeId: string; gen: VideoGenNodeData }) {
  const { updateNodeData } = useReactFlow();
  const current = VIDEO_MODES.find((item) => item.id === gen.mode) ?? VIDEO_MODES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="nodrag rounded-full">
          {current.label}
          <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-40">
        <DropdownMenuLabel className="text-muted-foreground">生成模式</DropdownMenuLabel>
        {VIDEO_MODES.map((item) => (
          <DropdownMenuItem
            key={item.id}
            onSelect={() =>
              updateNodeData(nodeId, {
                mode: item.id,
                // 2.5 的首尾帧模式只支持自适应比例，切过去时直接收敛
                ...(item.id === "first_last_frame" && gen.version === "seedance-2.5"
                  ? { ratio: "adaptive" }
                  : {}),
              })
            }
            className={cn("whitespace-nowrap", item.id === gen.mode && "bg-accent")}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 紧邻生成按钮：Seedance 版本 */
function VersionSelect({ nodeId, gen }: { nodeId: string; gen: VideoGenNodeData }) {
  const { updateNodeData } = useReactFlow();
  const current = videoVersionOf(gen.version);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="nodrag rounded-full">
          <Clapperboard />
          {current.label}
          <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel className="text-muted-foreground">视频模型</DropdownMenuLabel>
        {VIDEO_VERSIONS.map((item) => (
          <DropdownMenuItem
            key={item.id}
            onSelect={() =>
              updateNodeData(nodeId, {
                version: item.id,
                // 分辨率 / 时长按新版本能力收敛，比例按 2.5 首尾帧限制收敛
                ...((item.resolutions as readonly string[]).includes(gen.resolution)
                  ? {}
                  : { resolution: item.defaultResolution }),
                ...(gen.duration !== AUTO_DURATION && gen.duration > item.maxDuration
                  ? { duration: item.maxDuration }
                  : {}),
                ...(item.id === "seedance-2.5" && gen.mode === "first_last_frame"
                  ? { ratio: "adaptive" }
                  : {}),
              })
            }
            className={cn("whitespace-nowrap", item.id === gen.version && "bg-accent")}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 视频设置弹层：分辨率 / 宽高比 / 时长 / 是否生成音频 */
function VideoSetting({ nodeId, gen }: { nodeId: string; gen: VideoGenNodeData }) {
  const { updateNodeData } = useReactFlow();
  const version = videoVersionOf(gen.version);
  // 2.5 的首帧 / 首尾帧生视频只支持自适应比例
  const ratioLocked = gen.version === "seedance-2.5" && gen.mode === "first_last_frame";

  const label = [
    gen.resolution,
    gen.ratio === "adaptive" ? "自适应" : gen.ratio,
    gen.duration === AUTO_DURATION ? "自动" : `${gen.duration}s`,
  ].join(" · ");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="nodrag rounded-full">
          {label}
          <ChevronDown className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-4">
        <p className="font-medium text-sm">视频设置</p>

        <section className="space-y-2">
          <p className="text-muted-foreground text-xs">分辨率</p>
          <div className="flex flex-wrap gap-2">
            {version.resolutions.map((resolution) => (
              <PillOption
                key={resolution}
                active={gen.resolution === resolution}
                onClick={() => updateNodeData(nodeId, { resolution })}
              >
                {resolution}
              </PillOption>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-muted-foreground text-xs">宽高比</p>
          {ratioLocked ? (
            <p className="text-muted-foreground text-xs">
              Seedance 2.5 的首尾帧模式仅支持自适应，输出比例跟随首帧图片。
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {VIDEO_RATIOS.map((ratio) => {
                const [w = 0, h = 0] = ratio === "adaptive" ? [0, 0] : ratio.split(":").map(Number);
                return (
                  <RatioOption
                    key={ratio}
                    label={ratio === "adaptive" ? "自适应" : ratio}
                    width={w}
                    height={h}
                    active={gen.ratio === ratio}
                    onClick={() => updateNodeData(nodeId, { ratio })}
                  />
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <p className="text-muted-foreground text-xs">
            时长（{version.maxDuration === 15 ? "4–15" : "4–30"} 秒）
          </p>
          <div className="flex items-center gap-3">
            <PillOption
              active={gen.duration === AUTO_DURATION}
              onClick={() => updateNodeData(nodeId, { duration: AUTO_DURATION })}
            >
              自动
            </PillOption>
            {/* 拖动滑块即退出自动档；自动档下滑块停在默认的 5s 位置 */}
            <Slider
              min={4}
              max={version.maxDuration}
              step={1}
              value={[gen.duration === AUTO_DURATION ? 5 : gen.duration]}
              onValueChange={([value]) => {
                if (value !== undefined) updateNodeData(nodeId, { duration: value });
              }}
              className="flex-1"
            />
            <span className="w-10 shrink-0 text-right text-sm tabular-nums">
              {gen.duration === AUTO_DURATION ? "—" : `${gen.duration}s`}
            </span>
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-muted-foreground text-xs">音频</p>
          <div className="flex gap-2">
            <PillOption
              active={gen.generateAudio}
              onClick={() => updateNodeData(nodeId, { generateAudio: true })}
            >
              生成音频
            </PillOption>
            <PillOption
              active={!gen.generateAudio}
              onClick={() => updateNodeData(nodeId, { generateAudio: false })}
            >
              静音
            </PillOption>
          </div>
        </section>
      </PopoverContent>
    </Popover>
  );
}
