"use client";

import { AUDIO_NODE_SIZE, fitMediaSize, type MediaNodeData } from "@aigc-flow/shared";
import { Handle, type NodeProps, NodeResizer, Position, useReactFlow } from "@xyflow/react";
import { CircleAlert, FileImage, FileVideo, Loader2, Music } from "lucide-react";
import { type SyntheticEvent, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const KIND_ICON = { image: FileImage, video: FileVideo, audio: Music } as const;

/** 选中态的强调色。刻意不用主题的 primary —— 那是近黑色，做不出选框的意思 */
const ACCENT = "#3b82f6";

const HANDLE_STYLE = {
  width: 9,
  height: 9,
  borderRadius: 2,
  border: `1px solid ${ACCENT}`,
  backgroundColor: "#fff",
} as const;

export function MediaNode({ id, data, selected }: NodeProps) {
  const media = data as unknown as MediaNodeData;
  const Icon = KIND_ICON[media.kind];
  const { updateNode, updateNodeData } = useReactFlow();
  const freeResize = useShiftKey(Boolean(selected));

  const isAudio = media.kind === "audio";
  const isPlaceholder = media.status !== "ready" || !media.url;

  /**
   * 媒体加载完成后探测原始尺寸，并按比例缩到默认大小。
   *
   * 自动落位只做一次，判据是"之前从没测到过原始尺寸"，
   * 不能用"节点还没有 width/height" —— 占位框本来就带着 320×180，
   * 那样判会导致上传完成后永远不缩放。
   * 用户手动拉过之后，naturalWidth 已经存在，也就不会再被覆盖。
   */
  function handleNaturalSize(naturalWidth: number, naturalHeight: number) {
    if (!naturalWidth || !naturalHeight) return;
    if (media.naturalWidth === naturalWidth && media.naturalHeight === naturalHeight) return;

    const firstMeasure = !media.naturalWidth || !media.naturalHeight;
    updateNodeData(id, { naturalWidth, naturalHeight });

    if (firstMeasure) {
      const fitted = fitMediaSize(naturalWidth, naturalHeight);
      updateNode(id, { width: fitted.width, height: fitted.height, style: fitted });
    }
  }

  return (
    <>
      <NodeResizer
        isVisible={Boolean(selected)}
        color={ACCENT}
        handleStyle={HANDLE_STYLE}
        lineStyle={{ borderWidth: 0 }}
        minWidth={80}
        minHeight={isAudio ? AUDIO_NODE_SIZE.height : 60}
        maxHeight={isAudio ? AUDIO_NODE_SIZE.height : undefined}
        keepAspectRatio={!isAudio && !isPlaceholder && !freeResize}
      />

      {selected && <InfoBar media={media} icon={Icon} />}

      <div
        className={cn(
          "size-full overflow-hidden",
          // 未选中时完全没有外壳，画布上只看得到媒体本身
          selected && "outline outline-1 outline-[#3b82f6]",
          (isAudio || isPlaceholder) && "rounded-md",
        )}
      >
        <Handle type="target" position={Position.Left} />
        <MediaBody media={media} onNaturalSize={handleNaturalSize} />
        <Handle type="source" position={Position.Right} />
      </div>
    </>
  );
}

/** 选中时浮在节点上方外侧：左边图标 + 名称，右边原始像素尺寸 */
function InfoBar({
  media,
  icon: Icon,
}: {
  media: MediaNodeData;
  icon: (typeof KIND_ICON)[keyof typeof KIND_ICON];
}) {
  return (
    <div
      className="-top-6 pointer-events-none absolute inset-x-0 flex items-center justify-between gap-4 text-[#3b82f6] text-xs"
      style={{ color: ACCENT }}
    >
      <span className="flex min-w-0 items-center gap-1">
        <Icon className="size-3.5 shrink-0" />
        <span className="truncate">{media.label}</span>
      </span>
      {media.naturalWidth && media.naturalHeight && (
        <span className="shrink-0 tabular-nums">
          {media.naturalWidth} × {media.naturalHeight}
        </span>
      )}
    </div>
  );
}

function MediaBody({
  media,
  onNaturalSize,
}: {
  media: MediaNodeData;
  onNaturalSize: (w: number, h: number) => void;
}) {
  if (media.status === "uploading") {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-muted/40 text-muted-foreground text-xs">
        <Loader2 className="size-5 animate-spin" />
        <span className="max-w-[80%] truncate">{media.label}</span>
      </div>
    );
  }

  if (media.status === "error" || !media.url) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-1.5 rounded-md border border-destructive/60 border-dashed bg-destructive/5 px-3 text-center text-destructive text-xs">
        <CircleAlert className="size-5" />
        <span>{media.error ?? "上传失败"}</span>
        <span className="max-w-full truncate opacity-70">{media.label}</span>
      </div>
    );
  }

  if (media.kind === "image") {
    return (
      // biome-ignore lint/performance/noImgElement: 用户上传的任意图片，无需 next/image
      <img
        src={media.url}
        alt={media.label}
        draggable={false}
        onLoad={(event: SyntheticEvent<HTMLImageElement>) =>
          onNaturalSize(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)
        }
        className="size-full select-none object-fill"
      />
    );
  }

  if (media.kind === "video") {
    return (
      // nodrag 让指针事件留给播放器，否则一点播放就变成拖动节点
      <video
        src={media.url}
        controls
        preload="metadata"
        onLoadedMetadata={(event: SyntheticEvent<HTMLVideoElement>) =>
          onNaturalSize(event.currentTarget.videoWidth, event.currentTarget.videoHeight)
        }
        className="nodrag size-full object-fill"
      >
        <track kind="captions" />
      </video>
    );
  }

  return (
    <div className="flex size-full flex-col justify-center gap-1.5 rounded-md border bg-card px-3 py-2">
      <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <Music className="size-3.5 shrink-0" />
        <span className="truncate">{media.label}</span>
      </span>
      {/* biome-ignore lint/a11y/useMediaCaption: 用户上传的音频，没有字幕轨 */}
      <audio src={media.url} controls className="nodrag h-8 w-full" />
    </div>
  );
}

/** 只在节点被选中时监听，避免每个节点都往 window 上挂一对监听器 */
function useShiftKey(enabled: boolean): boolean {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setHeld(false);
      return;
    }

    const onDown = (event: KeyboardEvent) => event.key === "Shift" && setHeld(true);
    const onUp = (event: KeyboardEvent) => event.key === "Shift" && setHeld(false);
    // 切到别的窗口时 keyup 收不到，回来时 Shift 会一直是"按住"状态
    const onBlur = () => setHeld(false);

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [enabled]);

  return held;
}
