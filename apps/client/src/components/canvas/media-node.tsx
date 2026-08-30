"use client";

import type { MediaNodeData } from "@aigc-flow/shared";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { CircleAlert, FileImage, FileVideo, Loader2, Music } from "lucide-react";
import { cn } from "@/lib/utils";

const KIND_ICON = {
  image: FileImage,
  video: FileVideo,
  audio: Music,
} as const;

/**
 * 媒体节点：上传进来的图 / 视频 / 音频。
 * 三种状态共用同一个外壳，只有中间那块内容不同，
 * 这样 uploading → ready 时节点不会跳尺寸。
 */
export function MediaNode({ data, selected }: NodeProps) {
  const media = data as unknown as MediaNodeData;
  const Icon = KIND_ICON[media.kind];

  return (
    <div
      className={cn(
        "w-56 overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow",
        selected && "ring-2 ring-ring",
        media.status === "error" && "border-destructive/60",
      )}
    >
      <Handle type="target" position={Position.Left} />

      <div className="flex h-32 items-center justify-center bg-muted">
        <MediaPreview media={media} />
      </div>

      <div className="flex items-center gap-1.5 px-2.5 py-2">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-xs" title={media.label}>
          {media.label}
        </span>
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function MediaPreview({ media }: { media: MediaNodeData }) {
  if (media.status === "uploading") {
    return (
      <span className="flex flex-col items-center gap-2 text-muted-foreground text-xs">
        <Loader2 className="size-5 animate-spin" />
        上传中…
      </span>
    );
  }

  if (media.status === "error" || !media.url) {
    return (
      <span className="flex flex-col items-center gap-1.5 px-3 text-center text-destructive text-xs">
        <CircleAlert className="size-5" />
        {media.error ?? "上传失败"}
      </span>
    );
  }

  if (media.kind === "image") {
    return (
      // 上传来源是任意尺寸的用户文件，也可能是内网地址，不走 next/image 优化
      // biome-ignore lint/performance/noImgElement: 用户上传的任意图片，无需 next/image
      <img src={media.url} alt={media.label} className="size-full object-cover" />
    );
  }

  if (media.kind === "video") {
    return (
      // nodrag 让指针事件留给播放器，否则一点播放就变成拖动节点
      <video src={media.url} controls preload="metadata" className="nodrag size-full object-cover">
        <track kind="captions" />
      </video>
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-2 px-3">
      <Music className="size-5 text-muted-foreground" />
      {/* biome-ignore lint/a11y/useMediaCaption: 用户上传的音频，没有字幕轨 */}
      <audio src={media.url} controls className="nodrag w-full" />
    </div>
  );
}
