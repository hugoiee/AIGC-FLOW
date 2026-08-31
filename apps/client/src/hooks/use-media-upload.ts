"use client";

import {
  AUDIO_NODE_SIZE,
  MEDIA_DEFAULT_MAX_EDGE,
  MEDIA_NODE_TYPE,
  MEDIA_PLACEHOLDER_SIZE,
  type MediaNodeData,
  mediaKindOf,
} from "@aigc-flow/shared";
import type { Node, XYPosition } from "@xyflow/react";
import { useCallback } from "react";
import { toast } from "sonner";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/**
 * 多个文件同时落点时错开排布，避免叠成一摞。
 * 间距要能容下按 MEDIA_DEFAULT_MAX_EDGE(480) 落位后的最大节点，
 * 否则几张大图一起拖进来会互相遮挡。
 */
const GRID_GAP_X = MEDIA_DEFAULT_MAX_EDGE + 40;
const GRID_GAP_Y = MEDIA_DEFAULT_MAX_EDGE + 60;
const PER_ROW = 3;

export function buildPendingNode(file: File, position: XYPosition): Node {
  const kind = mediaKindOf(file.type, file.name) ?? "image";
  const data: MediaNodeData = { label: file.name, kind, status: "uploading" };

  // 占位框先给个尺寸，否则节点没高度、里面的 size-full 会塌成一条线。
  // 媒体加载出来后 MediaNode 会按原始比例重新落位。
  const size = kind === "audio" ? AUDIO_NODE_SIZE : MEDIA_PLACEHOLDER_SIZE;

  return {
    id: crypto.randomUUID(),
    type: MEDIA_NODE_TYPE,
    position,
    data: data as unknown as Record<string, unknown>,
    width: size.width,
    height: size.height,
    style: { width: size.width, height: size.height },
  };
}

export function layoutFor(origin: XYPosition, index: number): XYPosition {
  return {
    x: origin.x + (index % PER_ROW) * GRID_GAP_X,
    y: origin.y + Math.floor(index / PER_ROW) * GRID_GAP_Y,
  };
}

type UploadOutcome = { ok: true; url: string; filename: string } | { ok: false; error: string };

/**
 * 逐个文件独立上传，而不是一次 multipart 带多个。
 * 这样一个文件失败不牵连其他，也能让每个节点各自从"上传中"变成"就绪"，
 * 不用等最慢的那个。
 */
async function uploadOne(file: File): Promise<UploadOutcome> {
  const form = new FormData();
  form.append("file", file, file.name);

  try {
    const res = await fetch(`${API_URL}/api/uploads`, { method: "POST", body: form });
    const body = (await res.json()) as {
      files?: Array<{ url: string; filename: string; error?: string; status: string }>;
      message?: string;
    };

    if (!res.ok) return { ok: false, error: body.message ?? `上传失败（${res.status}）` };

    const result = body.files?.[0];
    if (!result || result.status === "error" || !result.url) {
      return { ok: false, error: result?.error ?? "上传失败" };
    }
    return { ok: true, url: result.url, filename: result.filename };
  } catch {
    return { ok: false, error: "连不上服务，确认 server 已启动" };
  }
}

type UseMediaUploadArgs = {
  /** 先把占位节点放上画布 */
  onNodesCreated: (nodes: Node[]) => void;
  /** 某个节点上传完成或失败，回填它的 data */
  onNodeSettled: (nodeId: string, patch: Partial<MediaNodeData>) => void;
};

export function useMediaUpload({ onNodesCreated, onNodeSettled }: UseMediaUploadArgs) {
  return useCallback(
    (files: File[], origin: XYPosition) => {
      if (files.length === 0) return;

      const pending = files.map((file, index) => buildPendingNode(file, layoutFor(origin, index)));
      onNodesCreated(pending);

      files.forEach((file, index) => {
        const node = pending[index];
        if (!node) return;

        void uploadOne(file).then((outcome) => {
          if (!outcome.ok) {
            toast.error(`「${file.name}」上传失败`, { description: outcome.error });
          }
          onNodeSettled(
            node.id,
            outcome.ok
              ? { status: "ready", url: outcome.url }
              : { status: "error", error: outcome.error },
          );
        });
      });
    },
    [onNodesCreated, onNodeSettled],
  );
}
