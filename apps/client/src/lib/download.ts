import type { Node } from "@xyflow/react";
import { nodeMediaOf } from "@/lib/node-media";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** 连点两个下载之间歇一下，瞬间连发浏览器容易把后面的丢掉 */
const DOWNLOAD_INTERVAL = 300;

export type DownloadItem = { url: string; filename: string };

/**
 * 名称是可以双击改的，改完往往就没有后缀了（「主视觉底图」）。
 * 存盘时按原地址的后缀补回去，否则下下来的文件系统认不出是什么。
 */
function withExtension(label: string, url: string): string {
  const path = url.split("?")[0] ?? url;
  const dot = path.lastIndexOf(".");
  const slash = path.lastIndexOf("/");
  if (dot <= slash) return label;

  const ext = path.slice(dot);
  return label.toLowerCase().endsWith(ext.toLowerCase()) ? label : label + ext;
}

/**
 * 选区里真正能下载的素材：上传的媒体，加上生成节点已经出结果的产出。
 * 判断走 lib/node-media.ts 的 nodeMediaOf —— 文本 / 编组本来就没有文件，
 * 上传中、生成中、失败的也都还没有地址，那边统一排除掉。
 */
export function downloadableMedia(nodes: Node[], selectedIds: string[]): DownloadItem[] {
  const ids = new Set(selectedIds);
  const items: DownloadItem[] = [];

  for (const node of nodes) {
    if (!ids.has(node.id)) continue;

    const media = nodeMediaOf(node);
    if (!media) continue;

    // 节点名是可以双击改的，存盘名按它来（后缀由地址补，见 withExtension）
    const label = (node.data as { label?: string }).label ?? "素材";
    items.push({ url: media.url, filename: withExtension(label, media.url) });
  }

  return items;
}

/**
 * 逐个触发下载。
 *
 * 素材地址不让浏览器直连（bcebos 没挂 CORS，也不带 Content-Disposition，
 * <a download> 跨域触发不了存盘），统一走服务端的 /api/uploads/download 转发，
 * 浏览器见到就会存盘，一个 <a> 就够了。
 *
 * 选多个时浏览器会弹一次「是否允许下载多个文件」，用户点允许即可 ——
 * 这是浏览器的安全机制，前端绕不过去，也不该绕。
 */
export async function downloadMedia(items: DownloadItem[]): Promise<void> {
  for (const [index, item] of items.entries()) {
    const query = `url=${encodeURIComponent(item.url)}&filename=${encodeURIComponent(item.filename)}`;

    const anchor = document.createElement("a");
    anchor.href = `${API_URL}/api/uploads/download?${query}`;
    // 跨域时浏览器会忽略这个属性，真正定文件名的是服务端的 Content-Disposition，
    // 写上只是让同源部署时也有正确行为
    anchor.download = item.filename;
    anchor.rel = "noopener";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();

    if (index < items.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, DOWNLOAD_INTERVAL));
    }
  }
}
