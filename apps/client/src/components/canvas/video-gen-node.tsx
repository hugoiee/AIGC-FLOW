"use client";

import {
  AUTO_DURATION,
  IMAGE_GEN_NODE_WIDTH,
  MAX_AUDIO_REFS,
  MAX_FRAME_IMAGES,
  MAX_REFERENCE_IMAGES,
  MAX_VIDEO_REFS,
  type MediaKind,
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
import { Slider } from "@/components/ui/slider";
import { useCanvasActions } from "@/hooks/use-canvas-actions";
import { api } from "@/lib/api";
import { downloadItemOf } from "@/lib/download";
import { resizedImageUrl, THUMB_WIDTH } from "@/lib/media-url";
import { nodeMarkOf } from "@/lib/node-mark";
import { type NodeMedia, nodeMediaOf } from "@/lib/node-media";
import { cn } from "@/lib/utils";
import { guardVideoDrag } from "@/lib/video-drag";
import { GEN_ACCENT, GEN_HANDLE_BASE, PillOption, RatioOption } from "./gen-node-controls";
import { NodeActionPanel } from "./node-action-panel";
import { NodeInfoBar } from "./node-info-bar";
import {
  ChipRejectedMark,
  NodeMarkBadge,
  REJECTED_CHIP_CLASS,
  REJECTED_MEDIA_CLASS,
} from "./node-mark-badge";
import { sizePatchOf } from "./node-size";
import { PromptEditor, usePromptTokens } from "./prompt-editor";

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
  const { activeNodeId, dropTargetId, setNodeMark, projectId } = useCanvasActions();
  const showMenu = Boolean(selected) && activeNodeId === id;
  // 右侧功能面板（下载 / 全屏）和下方菜单同时出现，且只在已经出结果时才有东西可操作
  const actionItem = showMenu ? downloadItemOf({ id, type: VIDEO_GEN_NODE_TYPE, data }) : null;
  const mark = nodeMarkOf({ type: VIDEO_GEN_NODE_TYPE, data });
  // 拖线悬停且本节点能接受时播放「可放置」动画
  const isDropTarget = dropTargetId === id;

  const connections = useNodeConnections({ handleType: "target" });
  const sources = useNodesData(connections.map((connection) => connection.source));
  const isFrames = gen.mode === "first_last_frame";
  // 三个列表的上限对齐接口约定：首尾帧模式只取前两张图（首帧、尾帧）、不支持参考视频。
  // 发请求用的 image_list / video_list / audio_list 直接用 hook 给的 urls：
  // prompt 里 @ 引用的占位符序号对应各列表的下标，必须出自同一份列表
  const { texts, refs, resolvedPrompt, urls } = usePromptTokens(id, gen.prompt, sources, {
    image: isFrames ? MAX_FRAME_IMAGES : MAX_REFERENCE_IMAGES,
    video: isFrames ? 0 : MAX_VIDEO_REFS,
    audio: MAX_AUDIO_REFS,
  });
  // 缩略格要知道上游有没有被标成废弃（灰显 + 小叉），和 prompt 徽章同一个判据
  const media = sources.flatMap((node) => {
    const item = node ? nodeMediaOf(node) : null;
    return item && node ? [{ ...item, rejected: nodeMarkOf(node) === "reject" }] : [];
  });

  // 参考素材 chips 按种类分组展示，上限同上
  const imageRefs = media
    .filter((item) => item.kind === "image")
    .slice(0, isFrames ? MAX_FRAME_IMAGES : MAX_REFERENCE_IMAGES);
  const videoRefs = isFrames
    ? []
    : media.filter((item) => item.kind === "video").slice(0, MAX_VIDEO_REFS);
  const audioRefs = media.filter((item) => item.kind === "audio").slice(0, MAX_AUDIO_REFS);

  const generating = gen.status === "generating";

  /** 点生成：同图像节点的状态机。内网接口同步阻塞，视频可能要等几分钟 */
  async function handleGenerate() {
    if (generating) return;
    // 清掉上一条的尺寸：新视频加载出来之前，信息条不该还挂着旧数字。
    // 标记跟结果走：采用 / 废弃是给上一个结果打的，一起清掉
    updateNodeData(id, {
      status: "generating",
      error: undefined,
      naturalWidth: undefined,
      naturalHeight: undefined,
      mark: undefined,
    });

    try {
      const res = await api.api.generate.video.$post({
        json: {
          projectId,
          version: gen.version,
          mode: gen.mode,
          prompt: resolvedPrompt,
          imageList: urls.image,
          videoList: urls.video,
          audioList: urls.audio,
          resolution: gen.resolution,
          ratio: gen.ratio,
          duration: gen.duration,
          generateAudio: gen.generateAudio,
        },
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        const message = body?.message ?? `生成失败（${res.status}）`;
        toast.error("视频生成失败", { description: message });
        updateNodeData(id, { status: "error", error: message });
        return;
      }

      const { url } = (await res.json()) as { url: string };
      updateNodeData(id, { status: "ready", resultUrl: url, error: undefined });
    } catch {
      toast.error("视频生成失败", { description: "连不上服务，确认 server 已启动" });
      updateNodeData(id, { status: "error", error: "连不上服务，确认 server 已启动" });
    }
  }

  return (
    <>
      {selected && (
        <NodeInfoBar
          nodeId={id}
          label={gen.label}
          icon={Clapperboard}
          accent={GEN_ACCENT}
          zoom={zoom}
          naturalWidth={gen.naturalWidth}
          naturalHeight={gen.naturalHeight}
        />
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
            <div className={cn(mark === "reject" && REJECTED_MEDIA_CLASS)}>
              <ResultArea
                gen={gen}
                aspect={currentAspect(gen)}
                onNaturalSize={(width, height) => {
                  const patch = sizePatchOf(gen, width, height);
                  if (patch) updateNodeData(id, patch);
                }}
              />
            </div>
          </div>

          {mark && <NodeMarkBadge mark={mark} zoom={zoom} />}

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

          {actionItem && (
            <NodeActionPanel
              item={actionItem}
              zoom={zoom}
              mark={mark}
              onMark={(next) => setNodeMark(id, next)}
            />
          )}
        </motion.div>

        {showMenu && (
          <div style={{ transform: `scale(${1 / zoom})`, transformOrigin: "top center" }}>
            <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm">
              <ReferenceChips refs={[...imageRefs, ...videoRefs, ...audioRefs]} frames={isFrames} />

              <PromptEditor
                value={gen.prompt}
                texts={texts}
                refs={refs}
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
function ResultArea({
  gen,
  aspect,
  onNaturalSize,
}: {
  gen: VideoGenNodeData;
  aspect: number;
  onNaturalSize: (width: number, height: number) => void;
}) {
  const [loadFailed, setLoadFailed] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 依赖 url 正是为了在换地址时重置
  useEffect(() => setLoadFailed(false), [gen.resultUrl]);

  if (gen.status === "ready" && gen.resultUrl && !loadFailed) {
    return (
      // nodrag 让指针事件留给播放器，否则一点播放就变成拖动节点
      <video
        src={gen.resultUrl}
        controls
        // 视频地址不走缩略参数，metadata 里的 videoWidth 就是原始尺寸
        preload="metadata"
        onLoadedMetadata={(event) =>
          onNaturalSize(event.currentTarget.videoWidth, event.currentTarget.videoHeight)
        }
        onError={() => setLoadFailed(true)}
        // nodrag 由它按指针位置动态挂：画面上放行拖节点，控件条上让给播放器
        onPointerDownCapture={guardVideoDrag}
        className="w-full"
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

/** 已连素材的实体格：图片缩略图，视频 / 音频显示种类图标 */
/** 已连入的参考素材：图片出缩略图，视频 / 音频出图标。上游废弃的灰显 + 小叉 */
type RefMedia = NodeMedia & { rejected: boolean };

function RefChip({ kind, url, rejected }: Pick<RefMedia, "kind" | "url" | "rejected">) {
  return (
    <div
      className={cn(
        "relative flex h-[68px] w-[56px] shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40 text-muted-foreground",
        rejected && REJECTED_CHIP_CLASS,
      )}
    >
      {kind === "image" ? (
        // biome-ignore lint/performance/noImgElement: 画布素材缩略图，无需 next/image
        <img
          src={resizedImageUrl(url, THUMB_WIDTH)}
          alt="参考素材"
          draggable={false}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : (
        <ChipIcon kind={kind} />
      )}
      {rejected && <ChipRejectedMark />}
    </div>
  );
}

/** 某一类参考素材的占位格，满上限后不再显示 */
function RefPlaceholder({
  kind,
  label,
  title,
}: {
  kind: MediaKind;
  label: string;
  title?: string;
}) {
  return (
    <div
      title={title}
      className="flex h-[68px] w-[56px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed bg-muted/40 text-muted-foreground/60"
    >
      <ChipIcon kind={kind} />
      <span className="text-[10px]">{label}</span>
    </div>
  );
}

/**
 * 参考素材横排，按类别分组展示，上限对齐接口约定
 * （image_list 多张、video_list ≤3 且仅参考图模式、audio_list ≤3 总时长 ≤15s）。
 * 参考图模式：图 / 视频 / 音频各自「已连的 + 一个占位格」，满上限收起占位。
 * 首尾帧模式：固定「首帧」「尾帧」两格（按连入顺序取前两张图），
 * 视频参考不支持不显示，音频照常。
 */
function ReferenceChips({ refs, frames }: { refs: RefMedia[]; frames: boolean }) {
  const images = refs.filter((item) => item.kind === "image");
  const videos = refs.filter((item) => item.kind === "video");
  const audios = refs.filter((item) => item.kind === "audio");

  const audioSlots = (
    <>
      {audios.map((item) => (
        <RefChip key={item.id} {...item} />
      ))}
      {audios.length < MAX_AUDIO_REFS && (
        <RefPlaceholder
          kind="audio"
          label="参考音频"
          title="最多 3 个，总时长不超过 15 秒，不可单独使用"
        />
      )}
    </>
  );

  if (frames) {
    return (
      <div className="nodrag nowheel flex gap-2 overflow-x-auto pb-1">
        {(["首帧", "尾帧"] as const).map((label, index) => {
          const item = images[index];
          return (
            <div
              key={label}
              className={cn(
                "relative h-[68px] w-[56px] shrink-0 overflow-hidden rounded-lg border bg-muted/40",
                item?.rejected && REJECTED_CHIP_CLASS,
              )}
            >
              {item ? (
                <>
                  {/* biome-ignore lint/performance/noImgElement: 画布素材缩略图，无需 next/image */}
                  <img
                    src={resizedImageUrl(item.url, THUMB_WIDTH)}
                    alt={label}
                    draggable={false}
                    loading="lazy"
                    decoding="async"
                    className="size-full object-cover"
                  />
                  {item.rejected && <ChipRejectedMark />}
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
        {audioSlots}
      </div>
    );
  }

  return (
    <div className="nodrag nowheel flex gap-2 overflow-x-auto pb-1">
      {images.map((item) => (
        <RefChip key={item.id} {...item} />
      ))}
      {images.length < MAX_REFERENCE_IMAGES && (
        <RefPlaceholder kind="image" label="参考图" title="参考图片，可连多张" />
      )}
      {videos.map((item) => (
        <RefChip key={item.id} {...item} />
      ))}
      {videos.length < MAX_VIDEO_REFS && (
        <RefPlaceholder kind="video" label="参考视频" title="最多 3 个，仅参考图模式支持" />
      )}
      {audioSlots}
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
