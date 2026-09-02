import type { Node } from "@xyflow/react";
import { nodeMediaOf } from "@/lib/node-media";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** 连点两个下载之间歇一下，给浏览器的「允许下载多个文件」提示留出反应时间 */
const DOWNLOAD_INTERVAL = 300;

/**
 * 承载下载导航的 iframe 什么时候能摘掉：响应头一到、导航被转成下载，
 * iframe 就和它无关了（此时移除不会掐断下载，验证过），但页面收不到任何事件
 * （下载型导航不触发 load）。服务端要先等上游 bcebos 回头才能应答，
 * 冷连接可能要好几秒，所以宁可多留一会儿 —— 一个隐藏的空 iframe 不占什么。
 */
const IFRAME_LIFETIME = 60_000;

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
 * 一个节点身上能下载的素材：上传的媒体，或生成节点已经出结果的产出。
 * 判断走 lib/node-media.ts 的 nodeMediaOf —— 文本 / 编组本来就没有文件，
 * 上传中、生成中、失败的也都还没有地址，那边统一排除掉。
 * 节点右侧功能面板的单个下载和多选工具条的批量下载都走这一份。
 */
export function downloadItemOf(node: {
  id: string;
  type?: string;
  data: unknown;
}): DownloadItem | null {
  const media = nodeMediaOf(node);
  if (!media) return null;

  // 节点名是可以双击改的，存盘名按它来（后缀由地址补，见 withExtension）
  const label = (node.data as { label?: string }).label ?? "素材";
  return { url: media.url, filename: withExtension(label, media.url) };
}

/** 选区里真正能下载的素材 */
export function downloadableMedia(nodes: Node[], selectedIds: string[]): DownloadItem[] {
  const ids = new Set(selectedIds);
  const items: DownloadItem[] = [];

  for (const node of nodes) {
    if (!ids.has(node.id)) continue;
    const item = downloadItemOf(node);
    if (item) items.push(item);
  }

  return items;
}

/**
 * 在独立的隐藏 iframe 里发起一次下载导航。
 *
 * **不能用 `<a download>` 点击**：API 和页面不同源，浏览器会忽略 `download`
 * 属性，把点击当成顶层页面的普通导航；而同一个 frame 里新导航会取消还没收到
 * 响应头的旧导航。服务端要 `await fetch(上游)` 拿到头才应答，第一次上游是冷连接，
 * 300ms 内回不了头，于是前面几个都被后一个取消，只有最后一个成活 ——
 * 表现就是「第一次只下一张，再点一次全下来了」（第二次连接已复用、回头够快）。
 * 每个文件各占一个 iframe，导航互不干扰，慢也只是晚到。
 *
 * 返回的不是附件（服务端 400 / 502 的 JSON）时 iframe 会正常 load 出一个隐藏的
 * 报错页，此时直接摘掉；转成下载的导航永远不触发 load，靠超时兜底清理。
 */
function downloadViaFrame(href: string): void {
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.src = href;

  const remove = () => {
    clearTimeout(timer);
    frame.remove();
  };
  const timer = setTimeout(remove, IFRAME_LIFETIME);
  frame.addEventListener("load", () => {
    // 有的浏览器会给刚插入的 iframe 先补一次初始 about:blank 的 load，
    // 那时导航还没开始，摘掉就把下载一起摘了；跨域的报错页 contentDocument 是 null
    if (frame.contentDocument?.location.href === "about:blank") return;
    remove();
  });

  document.body.append(frame);
}

/**
 * 逐个触发下载。
 *
 * 素材地址不让浏览器直连（bcebos 没挂 CORS，也不带 Content-Disposition，
 * 触发不了存盘），统一走服务端的 /api/uploads/download 转发，
 * 浏览器见到 Content-Disposition 就会存盘；真正定文件名的也是服务端的这个头。
 *
 * 选多个时浏览器会弹一次「是否允许下载多个文件」，用户点允许即可 ——
 * 这是浏览器的安全机制，前端绕不过去，也不该绕。
 */
export async function downloadMedia(items: DownloadItem[]): Promise<void> {
  for (const [index, item] of items.entries()) {
    const query = `url=${encodeURIComponent(item.url)}&filename=${encodeURIComponent(item.filename)}`;
    downloadViaFrame(`${API_URL}/api/uploads/download?${query}`);

    if (index < items.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, DOWNLOAD_INTERVAL));
    }
  }
}
