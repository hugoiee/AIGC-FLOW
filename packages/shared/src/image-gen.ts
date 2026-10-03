import { z } from "zod";
import { nodeMarkSchema } from "./node-mark";

/** 图像生成节点在 React Flow 里的 node.type */
export const IMAGE_GEN_NODE_TYPE = "image-gen";

/**
 * gpt 家族的质量档（接口 config.quality）。
 * 枚举是所有版本取值的**扁平并集**，某个模型支不支持某一档挂在
 * IMAGE_MODELS 行的 qualities 上 —— 和 video-gen.ts 用 VIDEO_VERSIONS.resolutions
 * 表达版本能力是同一套做法。只加成员不删改旧值：node data 不过 zod
 * （canvasNodeSchema 的 data 是 catchall），删掉旧取值会让老画布的节点
 * 在发请求时被 zValidator 挡下，而那个 400 的错误体里没有 message。
 */
export const gptQualitySchema = z.enum(["auto", "max", "xhigh", "high", "medium", "low"]);
export type GptQuality = z.infer<typeof gptQualitySchema>;

/** 质量档的中文标签。前端一律从这里取，不要另抄一份映射 */
export const GPT_QUALITIES = [
  { value: "auto", label: "自动" },
  { value: "max", label: "最高" },
  { value: "xhigh", label: "超高" },
  { value: "high", label: "高" },
  { value: "medium", label: "中" },
  { value: "low", label: "低" },
] as const;

export function gptQualityLabelOf(quality: GptQuality): string {
  return GPT_QUALITIES.find((item) => item.value === quality)?.label ?? quality;
}

/** gpt-image-2 的四档 */
const GPT_2_QUALITIES = ["auto", "high", "medium", "low"] as const;
/** 2.5 两个版本比 2 多出 xhigh / max 两档 */
const GPT_2_5_QUALITIES = ["auto", "max", "xhigh", "high", "medium", "low"] as const;

/**
 * 可选的图像模型。modelName / version 对应内网生产接口
 * 的 model_name / version 字段：nano 系共用一个 model_name，靠 version 区分。
 *
 * family 决定 config 的形状（gpt 是 size/n/quality，nano 是 aspect_ratio/image_size）
 * 以及设置弹层长什么样。**判家族一律用 isGptImage()，不要写 === "gpt-image-2"** ——
 * 那种写法在出现第二个 gpt 模型时会静默走错分支（参数按 nano 的形状发出去、
 * 占位比例读错字段、图标变成 nano 的星星），2.5 接进来时四处都踩过。
 * qualities 是该模型支持的质量档，nano 系压根不发 quality，给空数组。
 * hint 是模型下拉里的一行小字，说明这个版本擅长什么，只有需要区分的版本才写。
 */
export const IMAGE_MODELS = [
  {
    id: "gpt-image-2",
    label: "GPT Image 2",
    modelName: "gpt-image-2",
    version: "gpt-image-2",
    family: "gpt",
    qualities: GPT_2_QUALITIES,
  },
  {
    id: "gpt-image-2.5-flare",
    label: "GPT Image 2.5 Flare",
    // 2.5 两个版本的内网取值**待联调确认**：接口文档没写，这里按 gpt-image-2
    // 的现有写法取 OpenAI 的模型 id（modelName === version），对不上只改这两行
    modelName: "gpt-image-2.5-flare",
    version: "gpt-image-2.5-flare",
    family: "gpt",
    qualities: GPT_2_5_QUALITIES,
    hint: "更快，日常高频出图",
  },
  {
    id: "gpt-image-2.5-sunburst",
    label: "GPT Image 2.5 Sunburst",
    modelName: "gpt-image-2.5-sunburst",
    version: "gpt-image-2.5-sunburst",
    family: "gpt",
    qualities: GPT_2_5_QUALITIES,
    hint: "更精细，改图可控，耗时更长",
  },
  {
    id: "nano-banana-2",
    label: "Nano Banana 2",
    modelName: "nano-banana",
    version: "gemini-3.1-flash-image-preview",
    family: "nano",
    qualities: [],
  },
  {
    id: "nano-banana-pro",
    label: "Nano Banana Pro",
    modelName: "nano-banana",
    version: "gemini-3-pro-image-preview",
    family: "nano",
    qualities: [],
  },
] as const;

export const imageModelIdSchema = z.enum([
  "gpt-image-2",
  "gpt-image-2.5-flare",
  "gpt-image-2.5-sunburst",
  "nano-banana-2",
  "nano-banana-pro",
]);
export type ImageModelId = z.infer<typeof imageModelIdSchema>;

export function imageModelOf(id: ImageModelId) {
  return IMAGE_MODELS.find((model) => model.id === id) ?? IMAGE_MODELS[0];
}

/** 是不是 gpt 家族。config 形状、设置弹层、占位比例、图标四处都按它分流 */
export function isGptImage(id: ImageModelId): boolean {
  return imageModelOf(id).family === "gpt";
}

/**
 * 把质量档收敛成该模型支持的值。
 *
 * - **nano 系原样返回，一点不碰。** 节点 data 里两组参数常驻共存
 *   （见 imageGenNodeDataSchema 的注释），切去 nano 时也夹一遍的话，
 *   用户在 2.5 上选的 max 会在「切过去看一眼再切回来」之后变成 high。
 * - gpt 家族里不支持的档**回落到 high 而不是 auto**：会失效的只有 xhigh / max，
 *   两者都是「要更好的质量」，落到 high 保住意图，落到 auto 等于把选择丢了。
 *
 * 前端切模型时和服务端组装请求前调的是同一个函数，两边行为天然一致。
 */
export function clampImageQuality(id: ImageModelId, quality: GptQuality): GptQuality {
  const model = imageModelOf(id);
  if (model.family !== "gpt") return quality;
  // 先宽化再判断：as const 推出来的是字面量只读元组，直接 includes 过不了 tsc
  const supported: readonly GptQuality[] = model.qualities;
  return supported.includes(quality) ? quality : "high";
}

/**
 * gpt 家族的尺寸档。id 直接用 UI 展示的宽高比文案（对齐设计稿的宽高比网格），
 * size 是接口 config.size 的取值。
 * 这 12 档同时满足 2.5 的尺寸约束（宽高均被 16 整除、宽高比在 1:3 ~ 3:1 之间），
 * 所以两代共用一份，不按模型分。
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
 *
 * 两组模型参数都常驻保存（gpt 的 quality + sizePreset、nano 的 aspectRatio + imageSize），
 * **跨家族**切换不丢已选的值 —— 切去 nano 再切回来，gpt 那两个值原样还在。
 * 但 gpt 家族**内部**换型号会走 clampImageQuality：在 2.5 上选的 max / xhigh
 * 切到 gpt-image-2 会落成 high，再切回 2.5 也回不来（只有一个 quality 字段，
 * 存不下每个型号各自的选择）。行为和视频那边换版本降分辨率一致。
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
  /** 节点标记（采用 / 废弃），缺省即未标记。见 node-mark.ts */
  mark: nodeMarkSchema.optional(),
  /** status 为 error 时的原因 */
  error: z.string().optional(),
});

export type ImageGenNodeData = z.infer<typeof imageGenNodeDataSchema>;

/**
 * 新建图像生成节点的默认 data。默认 GPT Image 2.5 Flare（质量更好且比 2 快一半，
 * 适合当日常默认），gpt 默认自动 · 16:9(4k)，nano 默认 16:9 · 4K
 */
export const DEFAULT_IMAGE_GEN_DATA: ImageGenNodeData = {
  label: "图像生成",
  model: "gpt-image-2.5-flare",
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
  /** 发起生成的项目（画布）id，流水按它归属，统计面板按项目过滤 */
  projectId: z.number().int().positive(),
  model: imageModelIdSchema,
  prompt: z.string().min(1, "提示词不能为空"),
  imageList: z.array(z.url()).max(MAX_REFERENCE_IMAGES).default([]),
  quality: gptQualitySchema.default("auto"),
  sizePreset: gptSizePresetSchema.default("16:9(4k)"),
  aspectRatio: nanoAspectRatioSchema.default("16:9"),
  imageSize: nanoImageSizeSchema.default("4K"),
});

export type GenerateImageRequest = z.infer<typeof generateImageRequestSchema>;

/**
 * 把参数收敛成当前模型能接受的值，对应视频那边的 clampVideoConfig。
 * 目前只有质量档按模型分（见 clampImageQuality）；尺寸档 12 档两代 gpt 都合法，
 * 不用收敛。以后真出现按模型不同的尺寸 / 参数限制，收口点就是这里。
 */
export function clampImageConfig(input: GenerateImageRequest): GenerateImageRequest {
  return { ...input, quality: clampImageQuality(input.model, input.quality) };
}
