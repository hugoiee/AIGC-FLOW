import { type ImageModelId, isGptImage } from "@aigc-flow/shared";
import { Aperture, Sparkle } from "lucide-react";

/**
 * 模型图标。设计稿用的是品牌 logo（OpenAI / Gemini），按「图标尽量用 Lucide」的
 * 约定先用形状最接近的替代：nano 系的四角星和设计稿一致，GPT 用 Aperture 顶位，
 * 之后要换品牌 SVG 只改这一处。
 * 按家族判而不是按 id：以前写的是「不等于 gpt-image-2 就当 Gemini」，
 * 加进来的 2.5 两个版本会拿到 nano 的星星。
 */
export function ModelIcon({ modelId, className }: { modelId: ImageModelId; className?: string }) {
  const Icon = isGptImage(modelId) ? Aperture : Sparkle;
  return <Icon className={className} />;
}
