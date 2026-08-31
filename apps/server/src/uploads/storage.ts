import type { MediaKind, UploadedFile } from "@aigc-flow/shared";
import { getAppSettings } from "../db/settings";

/**
 * 内网接口按媒体种类分了两个端点：音频与图像/视频各一个完整地址，
 * 都在设置面板里配置（存 settings 表），见 docs/接口文档.md。
 */
function remoteEndpoint(kind: MediaKind): string {
  const settings = getAppSettings();
  return kind === "audio" ? settings.audioUploadUrl : settings.imageUploadUrl;
}

/**
 * 转发到内网上传服务。它的返回是 { urls: ["https://...bcebos.com/xxx.png"] }，
 * 这里取出 URL 包装成本服务的 UploadedFile。
 * 内网接口是同步阻塞式的（发出后一直等到处理完才返回），不设超时。
 */
export async function storeFile(file: File, kind: MediaKind): Promise<UploadedFile> {
  const form = new FormData();
  form.append("file", file, file.name);

  const res = await fetch(remoteEndpoint(kind), { method: "POST", body: form });
  if (!res.ok) throw new Error(`内网上传服务返回 ${res.status}`);

  const body = (await res.json()) as { urls?: string[] };
  const url = body.urls?.[0];
  if (!url) throw new Error("内网上传服务未返回文件地址");

  return { filename: file.name, url, status: "uploaded" };
}
