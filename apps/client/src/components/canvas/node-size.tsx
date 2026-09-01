"use client";

/**
 * 媒体 / 图像生成 / 视频生成三种节点共用的原始尺寸展示与探测。
 *
 * 探测有个坑：画布上渲染的常常是 bcebos 的 CDN 缩略版（见 lib/media-url.ts
 * 的 resizedImageUrl），这时 `<img>` 的 naturalWidth 量到的是缩略宽度而不是
 * 原图尺寸 —— 一张 4K 图会被报成 1080 宽。所以只有「渲染的就是原图」时才
 * 采信 DOM 量出来的数，判据由调用方给（渲染用的 src 和原始 url 相等）。
 * 视频和音频不走缩略参数，一律可信。
 */

type NodeSize = { naturalWidth?: number; naturalHeight?: number };

/** 信息条右侧的原始像素尺寸。没量到就整个不渲染，不占位置 */
export function NodeSizeLabel({ naturalWidth, naturalHeight }: NodeSize) {
  if (!naturalWidth || !naturalHeight) return null;

  return (
    <span className="shrink-0 tabular-nums">
      {naturalWidth} × {naturalHeight}
    </span>
  );
}

/**
 * 算出要写进 node data 的尺寸补丁，没变化时返回 null 让调用方跳过。
 * 每次 onLoad 都无脑 updateNodeData 会让画布判定成有改动去存盘。
 */
export function sizePatchOf(
  current: NodeSize,
  width: number,
  height: number,
): Required<NodeSize> | null {
  // 元素还没解码完时会报 0，别把 0 写进去
  if (!width || !height) return null;
  if (current.naturalWidth === width && current.naturalHeight === height) return null;

  return { naturalWidth: width, naturalHeight: height };
}
