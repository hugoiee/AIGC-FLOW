/**
 * bcebos 支持在 URL 上带图片处理参数在 CDN 侧出缩略图：
 * `xxx.png?x-bce-process=image/resize,w_960`。
 *
 * 画布上渲染一律用缩略版（4K 原图直出的网络与内存开销太大），
 * node data 里存的永远是原图 URL —— 双击查看原图和批量下载都用它。
 */

/** 参考图 chips 的缩略宽度（56px 格子 × 2 倍屏富余） */
export const THUMB_WIDTH = 128;

/** prompt 里 @ 徽章悬停预览的缩略宽度（160px 预览框 × 2 倍屏富余） */
export const PREVIEW_WIDTH = 320;

/** 节点画面区的渲染宽度（节点宽 534 × 2 倍屏富余） */
export const CANVAS_WIDTH = 1080;

/**
 * 给 bcebos 图片地址加缩放参数。
 * - 非 bcebos 域名（本地 mock 等）原样返回；
 * - 带 authorization 签名的地址原样返回 —— 追加 query 可能破坏签名导致 403，
 *   内网确认签名 URL 兼容图片处理参数后再放开。
 * 参数手动拼接：URLSearchParams 会把 `/` `,` 转义成 %2F %2C，BOS 不认。
 */
export function resizedImageUrl(url: string, width: number): string {
  try {
    const parsed = new URL(url);
    const isBos = parsed.hostname === "bcebos.com" || parsed.hostname.endsWith(".bcebos.com");
    if (!isBos || parsed.searchParams.has("authorization")) return url;
    return `${url}${url.includes("?") ? "&" : "?"}x-bce-process=image/resize,w_${width}`;
  } catch {
    return url;
  }
}
