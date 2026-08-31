import { z } from "zod";

/** 画布支持的媒体种类。由 MIME 大类决定，不看扩展名 */
export const MEDIA_KINDS = ["image", "video", "audio"] as const;
export const mediaKindSchema = z.enum(MEDIA_KINDS);
export type MediaKind = (typeof MEDIA_KINDS)[number];

/**
 * 单文件大小上限。服务端用 Hono 的 parseBody 解析 multipart，
 * 整个文件会进内存，所以不能开太大。
 */
export const MAX_FILE_SIZE: Record<MediaKind, number> = {
  image: 32 * 1024 * 1024,
  video: 200 * 1024 * 1024,
  audio: 64 * 1024 * 1024,
};

/** 一次请求最多带几个文件 */
export const MAX_FILES_PER_UPLOAD = 20;

/**
 * MIME 不可靠时的扩展名兜底。
 * 浏览器对部分容器格式（尤其 .mp4 / .mkv / .m4a）会给 application/octet-stream
 * 甚至空串，只认 MIME 会把正常文件挡在门外。
 */
const EXT_KINDS: Record<string, MediaKind> = {
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".gif": "image",
  ".webp": "image",
  ".bmp": "image",
  ".svg": "image",
  ".avif": "image",
  ".heic": "image",
  ".tif": "image",
  ".tiff": "image",
  ".mp4": "video",
  ".mov": "video",
  ".webm": "video",
  ".mkv": "video",
  ".avi": "video",
  ".m4v": "video",
  ".flv": "video",
  ".wmv": "video",
  ".mp3": "audio",
  ".wav": "audio",
  ".m4a": "audio",
  ".aac": "audio",
  ".ogg": "audio",
  ".flac": "audio",
  ".opus": "audio",
  ".wma": "audio",
};

export function mediaKindOf(mimeType: string, filename = ""): MediaKind | null {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";

  const dot = filename.lastIndexOf(".");
  if (dot === -1) return null;
  return EXT_KINDS[filename.slice(dot).toLowerCase()] ?? null;
}

/**
 * 上传接口的返回（本服务包装后的形状）。
 * 内网接口本身只回 { urls: [...] }（docs/接口文档.md），服务端转发层
 * 把它包装成逐文件的结果，一个文件失败不牵连整批。
 */
export const uploadedFileSchema = z.object({
  filename: z.string(),
  url: z.string(),
  status: z.enum(["uploaded", "error"]),
  /** status 为 error 时的原因 */
  error: z.string().optional(),
});

export const uploadResponseSchema = z.object({
  files: z.array(uploadedFileSchema),
  success: z.boolean(),
});

export type UploadedFile = z.infer<typeof uploadedFileSchema>;
export type UploadResponse = z.infer<typeof uploadResponseSchema>;

/** 媒体节点在 React Flow 里的 node.type */
export const MEDIA_NODE_TYPE = "media";

/**
 * 媒体节点的 data。
 * uploading / error 是运行时状态，不会落盘（见 lib/graph.ts 的 toPersistedGraph）。
 */
export const mediaNodeDataSchema = z.object({
  label: z.string(),
  kind: mediaKindSchema,
  status: z.enum(["uploading", "ready", "error"]),
  /** status 为 ready 时必有 */
  url: z.string().optional(),
  /** status 为 error 时的原因 */
  error: z.string().optional(),
  /** 媒体的原始像素尺寸，加载完成后由前端探测写入，只用于信息条展示 */
  naturalWidth: z.number().positive().optional(),
  naturalHeight: z.number().positive().optional(),
});

export type MediaNodeData = z.infer<typeof mediaNodeDataSchema>;

/** 媒体节点首次落到画布上时，最长边不超过这个值 */
export const MEDIA_DEFAULT_MAX_EDGE = 480;

/** 尺寸未知时的占位框（上传中 / 失败 / 探测不到原始尺寸） */
export const MEDIA_PLACEHOLDER_SIZE = { width: 320, height: 180 } as const;

/** 音频没有画面，固定高度，只允许调宽 */
export const AUDIO_NODE_SIZE = { width: 320, height: 96 } as const;

/**
 * 按原始比例把媒体缩进画布。
 * 比 MEDIA_DEFAULT_MAX_EDGE 小的图保持原尺寸不放大 ——
 * 放大只会让它糊掉，而且用户本来就能手动拉大。
 */
export function fitMediaSize(
  naturalWidth: number,
  naturalHeight: number,
  maxEdge: number = MEDIA_DEFAULT_MAX_EDGE,
): { width: number; height: number } {
  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return { ...MEDIA_PLACEHOLDER_SIZE };
  }

  const scale = Math.min(1, maxEdge / Math.max(naturalWidth, naturalHeight));
  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale)),
  };
}
