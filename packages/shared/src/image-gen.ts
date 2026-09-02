import { z } from "zod";

/** 图像生成节点在 React Flow 里的 node.type */
export const IMAGE_GEN_NODE_TYPE = "image-gen";

/**
 * 可选的图像模型。modelName / version 对应内网生产接口
 * 的 model_name / version 字段：nano 系共用一个 model_name，靠 version 区分。
 */
export const IMAGE_MODELS = [
  {
    id: "gpt-image-2",
    label: "GPT Image 2",
    modelName: "gpt-image-2",
    version: "gpt-image-2",
  },
  {
    id: "nano-banana-2",
    label: "Nano Banana 2",
    modelName: "nano-banana",
    version: "gemini-3.1-flash-image-preview",
  },
  {
    id: "nano-banana-pro",
    label: "Nano Banana Pro",
    modelName: "nano-banana",
    version: "gemini-3-pro-image-preview",
  },
] as const;

export const imageModelIdSchema = z.enum(["gpt-image-2", "nano-banana-2", "nano-banana-pro"]);
export type ImageModelId = z.infer<typeof imageModelIdSchema>;

export function imageModelOf(id: ImageModelId) {
  return IMAGE_MODELS.find((model) => model.id === id) ?? IMAGE_MODELS[0];
}

/** gpt-image-2 的质量档 */
export const GPT_QUALITIES = [
  { value: "auto", label: "自动" },
  { value: "high", label: "高" },
  { value: "medium", label: "中" },
  { value: "low", label: "低" },
] as const;

export const gptQualitySchema = z.enum(["auto", "high", "medium", "low"]);
export type GptQuality = z.infer<typeof gptQualitySchema>;

/**
 * gpt-image-2 的尺寸档。id 直接用 UI 展示的宽高比文案（对齐设计稿的宽高比网格），
 * size 是接口 config.size 的取值。
 */
export const GPT_SIZE_PRESETS = [
  { id: "1:1", size: "1024x1024", width: 1024, height: 1024 },
  { id: "3:2", size: "1536x1024", width: 1536, height: 1024 },
  { id: "2:3", size: "1024x1536", width: 1024, height: 1536 },
  { id: "4:3", size: "1536x1152", width: 1536, height: 1152 },
  { id: "3:4", size: "1152x1536", width: 1152, height: 1536 },
  { id: "9:16", size: "864x1536", width: 864, height: 1536 },
  { id: "1:1(2k)", size: "2048x2048", width: 2048, height: 2048 },
  { id: "16:9(2k)", size: "2048x1152", width: 2048, height: 1152 },
  { id: "9:16(2k)", size: "1152x2048", width: 1152, height: 2048 },
  { id: "16:9(4k)", size: "3840x2160", width: 3840, height: 2160 },
  { id: "9:16(4k)", size: "2160x3840", width: 2160, height: 3840 },
  { id: "auto", size: "auto", width: 0, height: 0 },
] as const;

export const gptSizePresetSchema = z.enum([
  "1:1",
  "3:2",
  "2:3",
  "4:3",
  "3:4",
  "9:16",
  "1:1(2k)",
  "16:9(2k)",
  "9:16(2k)",
  "16:9(4k)",
  "9:16(4k)",
  "auto",
]);
export type GptSizePreset = z.infer<typeof gptSizePresetSchema>;

export function gptSizeOf(preset: GptSizePreset) {
  return GPT_SIZE_PRESETS.find((item) => item.id === preset) ?? GPT_SIZE_PRESETS[0];
}

/** nano 系的宽高比与分辨率档（接口 config.aspect_ratio / image_size） */
export const nanoAspectRatioSchema = z.enum([
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "9:16",
  "16:9",
  "21:9",
]);
export type NanoAspectRatio = z.infer<typeof nanoAspectRatioSchema>;
export const NANO_ASPECT_RATIOS = nanoAspectRatioSchema.options;

export const nanoImageSizeSchema = z.enum(["1K", "2K", "4K"]);
export type NanoImageSize = z.infer<typeof nanoImageSizeSchema>;
export const NANO_IMAGE_SIZES = nanoImageSizeSchema.options;

/** 参考图数量上限 */
export const MAX_REFERENCE_IMAGES = 16;

/**
 * 图像生成节点的 data。
 * generating 是运行时状态，不落盘（刷新后 fetch 已经断了，回到 idle 重新生成）。
 * 两组模型参数都常驻保存，切换模型不丢已选的值。
 */
export const imageGenNodeDataSchema = z.object({
  label: z.string(),
  model: imageModelIdSchema,
  prompt: z.string(),
  quality: gptQualitySchema,
  sizePreset: gptSizePresetSchema,
  aspectRatio: nanoAspectRatioSchema,
  imageSize: nanoImageSizeSchema,
  status: z.enum(["idle", "generating", "ready", "error"]),
  /** status 为 ready 时必有：生成结果的图片地址 */
  resultUrl: z.string().optional(),
  /** 结果媒体的原始像素尺寸，加载完成后由前端探测写入，只用于信息条展示 */
  naturalWidth: z.number().positive().optional(),
  naturalHeight: z.number().positive().optional(),
  /** status 为 error 时的原因 */
  error: z.string().optional(),
});

export type ImageGenNodeData = z.infer<typeof imageGenNodeDataSchema>;

/** 新建图像生成节点的默认 data。gpt 默认自动 · 16:9(4k)，nano 默认 16:9 · 4K */
export const DEFAULT_IMAGE_GEN_DATA: ImageGenNodeData = {
  label: "图像生成",
  model: "gpt-image-2",
  prompt: "",
  quality: "auto",
  sizePreset: "16:9(4k)",
  aspectRatio: "16:9",
  imageSize: "4K",
  status: "idle",
};

/** 图像生成节点的画布尺寸：下方卡片固定宽，图片区高度按结果自适应 */
export const IMAGE_GEN_NODE_WIDTH = 534;

/** 生成接口（本服务的 /api/generate）的入参。服务端按 model 挑对应参数组装内网请求 */
export const generateImageRequestSchema = z.object({
  model: imageModelIdSchema,
  prompt: z.string().min(1, "提示词不能为空"),
  imageList: z.array(z.url()).max(MAX_REFERENCE_IMAGES).default([]),
  quality: gptQualitySchema.default("auto"),
  sizePreset: gptSizePresetSchema.default("16:9(4k)"),
  aspectRatio: nanoAspectRatioSchema.default("16:9"),
  imageSize: nanoImageSizeSchema.default("4K"),
});

export type GenerateImageRequest = z.infer<typeof generateImageRequestSchema>;
