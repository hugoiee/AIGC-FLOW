import type { ImageModelId } from "@aigc-flow/shared";
import { Aperture, Sparkle } from "lucide-react";

/**
 * 模型图标。设计稿用的是品牌 logo（OpenAI / Gemini），按「图标尽量用 Lucide」的
 * 约定先用形状最接近的替代：nano 系的四角星和设计稿一致，GPT 用 Aperture 顶位，
 * 之后要换品牌 SVG 只改这一处。
 */
export function ModelIcon({ modelId, className }: { modelId: ImageModelId; className?: string }) {
  const Icon = modelId === "gpt-image-2" ? Aperture : Sparkle;
  return <Icon className={className} />;
}
