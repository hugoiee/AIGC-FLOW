import type { AppSettings, MediaKind, UploadedFile } from "@aigc-flow/shared";
import { messageOf, snippet } from "../lib/upstream";

/**
 * 内网上传服务的返回。图像/视频（/api/upload）和音频（/api/upload-media）
 * 两个端点实测都是这个形状，接口文档里写的 { urls: [...] } 是错的。
 */
type UploadResponse = {
  files?: Array<{ url?: string; filename?: string; status?: string; error?: string }>;
  success?: boolean;
};

/**
 * 内网接口按媒体种类分了两个端点：音频与图像/视频各一个完整地址，
 * 都在设置面板里配置（存 settings 表）。
 */
function remoteEndpoint(kind: MediaKind, settings: AppSettings): string {
  return kind === "audio" ? settings.audioUploadUrl : settings.imageUploadUrl;
}

/**
 * 转发到内网上传服务。表单要带两个字段：files（复数，别写成 file）和
 * req_from —— 和 /aigc 生成接口是同一个来源标识，缺了会被拒。
 * 返回里取出素材地址，包装成本服务的 UploadedFile。
 * 内网接口是同步阻塞式的（发出后一直等到处理完才返回），不设超时。
 */
export async function storeFile(
  file: File,
  kind: MediaKind,
  settings: AppSettings,
): Promise<UploadedFile> {
  // 内网地址不进仓库、没有默认值，没配就直接报出来，别拿空地址去 fetch
  const endpoint = remoteEndpoint(kind, settings);
  if (!endpoint) {
    throw new Error(`请先在设置面板填写${kind === "audio" ? "音频" : "图像 / 视频"}上传接口地址`);
  }

  const form = new FormData();
  form.append("files", file, file.name);
  form.append("req_from", settings.reqFrom);

  let res: Response;
  try {
    res = await fetch(endpoint, { method: "POST", body: form });
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

  // 认地址不认状态：status 有 success / duplicate 等好几种，duplicate 是按内容
  // 哈希去重命中了已有文件，照样给地址、照样算成功，枚举状态白名单迟早漏一个。
  // filename 回原始文件名而不是内网那个哈希名 —— 这是本服务自己的契约，
  // 前端靠它把结果和上传的文件对号。
  const url = body.files?.[0]?.url;
  if (url) return { filename: file.name, url, status: "uploaded" };

  // 2xx 却没拿到地址。原始响应必须原样打出来 —— 只报一句「未返回文件地址」
  // 根本分不清是表单字段名不对、文件被拒，还是返回结构和文档对不上。
  console.error("[upload] 2xx 但没有地址", file.name, text);
  throw new Error(noUrlMessage(body, text));
}

/**
 * 2xx 但没有地址时的报错文案。分几种情况说，因为排查方向完全不同：
 * 带了 error / message 一类的字段 = 服务端主动拒绝，直接透传它的话；
 * 只有个 status = 至少把状态词报出来；
 * files 是空数组 = 请求到了但文件没进去（多半表单字段名不对）；
 * 都不是 = 返回结构又变了，把原始响应甩出来。
 */
function noUrlMessage(body: UploadResponse, text: string): string {
  const entry = body.files?.[0];

  const detail = messageOf(entry) || messageOf(body);
  if (detail) return `内网上传服务拒绝了这个文件：${detail}`;

  if (entry?.status) return `内网上传服务没给地址，状态是 ${entry.status}`;

  if (Array.isArray(body.files)) {
    return "内网上传服务返回了空结果，文件没被收下（多半是表单字段名或文件本身不合要求）";
  }

  return `内网上传服务未返回文件地址：${snippet(text) || "（空响应）"}`;
}
