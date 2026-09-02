import { z } from "zod";
import { nodeMarkSchema } from "./node-mark";

/** 视频生成节点在 React Flow 里的 node.type */
export const VIDEO_GEN_NODE_TYPE = "video-gen";

/**
 * seedance 版本。apiVersion 对应内网接口的 version 字段，
 * 两个版本的分辨率与时长范围不同，收敛规则见 clampVideoConfig。
 */
export const VIDEO_VERSIONS = [
  {
    id: "seedance-2.0",
    label: "Seedance 2.0",
    apiVersion: "seedance-2.0",
    resolutions: ["480p", "720p", "1080p", "4k"],
    defaultResolution: "1080p",
    maxDuration: 15,
  },
  {
    id: "seedance-2.5",
    label: "Seedance 2.5",
    apiVersion: "doubao-seedance-2-5-260628",
    resolutions: ["480p", "720p"],
    defaultResolution: "720p",
    maxDuration: 30,
  },
] as const;

export const videoVersionIdSchema = z.enum(["seedance-2.0", "seedance-2.5"]);
export type VideoVersionId = z.infer<typeof videoVersionIdSchema>;

export function videoVersionOf(id: VideoVersionId) {
  return VIDEO_VERSIONS.find((item) => item.id === id) ?? VIDEO_VERSIONS[0];
}

/**
 * 生成模式。first_last_frame 是占位值 —— 接口文档只写明了参考图模式的
 * mode 取值（reference_image），首尾帧模式的值待内网联调确认，改这里即可。
 */
export const VIDEO_MODES = [
  { id: "reference_image", label: "参考图模式" },
  { id: "first_last_frame", label: "首尾帧模式" },
] as const;

export const videoModeSchema = z.enum(["reference_image", "first_last_frame"]);
export type VideoMode = z.infer<typeof videoModeSchema>;

export const videoResolutionSchema = z.enum(["480p", "720p", "1080p", "4k"]);
export type VideoResolution = z.infer<typeof videoResolutionSchema>;

/** adaptive 为自适应（跟随首帧 / 参考图） */
export const videoRatioSchema = z.enum(["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"]);
export type VideoRatio = z.infer<typeof videoRatioSchema>;
export const VIDEO_RATIOS = videoRatioSchema.options;

/** 参考素材上限（接口约定：视频 / 音频最多各 3 个，首尾帧图片最多 2 张） */
export const MAX_VIDEO_REFS = 3;
export const MAX_AUDIO_REFS = 3;
export const MAX_FRAME_IMAGES = 2;

/** duration 的 -1 表示自动 */
export const AUTO_DURATION = -1;

export const videoDurationSchema = z.union([
  z.literal(AUTO_DURATION),
  z.number().int().min(4).max(30),
]);

/**
 * 视频生成节点的 data。generating 不落盘（同图像生成节点）。
 */
export const videoGenNodeDataSchema = z.object({
  label: z.string(),
  version: videoVersionIdSchema,
  mode: videoModeSchema,
  prompt: z.string(),
  resolution: videoResolutionSchema,
  ratio: videoRatioSchema,
  duration: videoDurationSchema,
  generateAudio: z.boolean(),
  status: z.enum(["idle", "generating", "ready", "error"]),
  /** status 为 ready 时必有：生成结果的视频地址 */
  resultUrl: z.string().optional(),
  /** 结果媒体的原始像素尺寸，加载完成后由前端探测写入，只用于信息条展示 */
  naturalWidth: z.number().positive().optional(),
  naturalHeight: z.number().positive().optional(),
  /** 节点标记（采用 / 废弃），缺省即未标记。见 node-mark.ts */
  mark: nodeMarkSchema.optional(),
  /** status 为 error 时的原因 */
  error: z.string().optional(),
});

export type VideoGenNodeData = z.infer<typeof videoGenNodeDataSchema>;

/** 默认：Seedance 2.0 · 参考图模式 · 1080p · 自适应宽高比 · 5s */
export const DEFAULT_VIDEO_GEN_DATA: VideoGenNodeData = {
  label: "视频生成",
  version: "seedance-2.0",
  mode: "reference_image",
  prompt: "",
  resolution: "1080p",
  ratio: "adaptive",
  duration: 5,
  generateAudio: true,
  status: "idle",
};

/** 生成接口（本服务的 /api/generate/video）的入参 */
export const generateVideoRequestSchema = z.object({
  version: videoVersionIdSchema,
  mode: videoModeSchema,
  prompt: z.string().min(1, "提示词不能为空"),
  imageList: z.array(z.url()).max(16).default([]),
  videoList: z.array(z.url()).max(MAX_VIDEO_REFS).default([]),
  audioList: z.array(z.url()).max(MAX_AUDIO_REFS).default([]),
  resolution: videoResolutionSchema.default("1080p"),
  ratio: videoRatioSchema.default("adaptive"),
  duration: videoDurationSchema.default(5),
  generateAudio: z.boolean().default(true),
});

export type GenerateVideoRequest = z.infer<typeof generateVideoRequestSchema>;

/**
 * 把任意参数组合收敛成当前版本 + 模式下接口能接受的值：
 * - 分辨率不在该版本支持列表里时回退到该版本默认档
 * - 时长夹到该版本范围（-1 自动除外）
 * - 首尾帧模式不支持参考视频，图片最多 2 张（首帧、尾帧）
 * - 2.5 的首尾帧模式比例只支持 adaptive
 * 前端切换版本 / 模式时和服务端组装请求前都用它，两边行为一致。
 */
export function clampVideoConfig(input: GenerateVideoRequest): GenerateVideoRequest {
  const version = videoVersionOf(input.version);
  const isFrames = input.mode === "first_last_frame";

  const resolution = (version.resolutions as readonly string[]).includes(input.resolution)
    ? input.resolution
    : version.defaultResolution;

  const duration =
    input.duration === AUTO_DURATION
      ? AUTO_DURATION
      : Math.min(Math.max(input.duration, 4), version.maxDuration);

  const ratio = isFrames && input.version === "seedance-2.5" ? "adaptive" : input.ratio;

  return {
    ...input,
    resolution,
    duration,
    ratio,
    imageList: isFrames ? input.imageList.slice(0, MAX_FRAME_IMAGES) : input.imageList,
    videoList: isFrames ? [] : input.videoList.slice(0, MAX_VIDEO_REFS),
    audioList: input.audioList.slice(0, MAX_AUDIO_REFS),
  };
}
