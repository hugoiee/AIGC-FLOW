import type { AppSettings, MediaKind, UploadedFile } from "@aigc-flow/shared";
import { messageOf, snippet } from "../lib/upstream";

/** 内网上传服务的成功返回（docs/接口文档.md）。失败时形状不定，现挖 */
type UploadResponse = { urls?: string[] };

/**
 * 内网接口按媒体种类分了两个端点：音频与图像/视频各一个完整地址，
 * 都在设置面板里配置（存 settings 表），见 docs/接口文档.md。
 */
function remoteEndpoint(kind: MediaKind, settings: AppSettings): string {
  return kind === "audio" ? settings.audioUploadUrl : settings.imageUploadUrl;
}

/**
 * 转发到内网上传服务。表单要带两个字段：files（复数，别写成 file）和
 * req_from —— 和 /aigc 生成接口是同一个来源标识，缺了会被拒。
 * 它的返回是 { urls: ["https://...bcebos.com/xxx.png"] }，
 * 这里取出 URL 包装成本服务的 UploadedFile。
 * 内网接口是同步阻塞式的（发出后一直等到处理完才返回），不设超时。
 */
export async function storeFile(
  file: File,
  kind: MediaKind,
  settings: AppSettings,
): Promise<UploadedFile> {
  const form = new FormData();
  form.append("files", file, file.name);
  form.append("req_from", settings.reqFrom);

  let res: Response;
  try {
    res = await fetch(remoteEndpoint(kind, settings), { method: "POST", body: form });
  } catch (error) {
    console.error("[upload] fetch failed", file.name, error);
    throw new Error("连不上内网上传服务，确认在内网环境且地址配置正确");
  }

  // 响应体只能读一次，成功失败都从这份文本走：出问题时它是唯一的线索
  const text = await res.text().catch(() => "");

  if (!res.ok) {
    console.error("[upload] HTTP", res.status, file.name, text);
    throw new Error(`内网上传服务返回 ${res.status}${text ? `：${snippet(text)}` : ""}`);
  }

  let body: UploadResponse;
  try {
    body = JSON.parse(text) as UploadResponse;
  } catch {
    console.error("[upload] 响应不是 JSON", file.name, text);
    throw new Error(`内网上传服务返回的不是 JSON：${snippet(text) || "（空响应）"}`);
  }

  const url = body.urls?.[0];
  if (url) return { filename: file.name, url, status: "uploaded" };

  // 2xx 却没拿到地址。原始响应必须原样打出来 —— 只报一句「未返回文件地址」
  // 根本分不清是表单字段名不对、文件被拒，还是返回结构和文档对不上。
  console.error("[upload] 2xx 但没有 urls", file.name, text);
  throw new Error(noUrlMessage(body, text));
}

/**
 * 2xx 但没有地址时的报错文案。分三种情况说，因为排查方向完全不同：
 * urls 是空数组 = 请求到了但文件没进去（多半表单字段名不对）；
 * 带了 message 一类的字段 = 服务端主动拒绝，直接透传它的话；
 * 都不是 = 返回结构和文档对不上，把原始响应甩出来。
 */
function noUrlMessage(body: UploadResponse, text: string): string {
  if (Array.isArray(body.urls)) {
    return "内网上传服务返回了空的 urls，文件没被收下（多半是表单字段名或文件本身不合要求）";
  }

  const detail = messageOf(body);
  if (detail) return `内网上传服务拒绝了这个文件：${detail}`;

  return `内网上传服务未返回文件地址：${snippet(text) || "（空响应）"}`;
}
