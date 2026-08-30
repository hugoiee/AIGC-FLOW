import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import type { MediaKind, UploadedFile } from "@aigc-flow/shared";
import { env } from "../env";

export const uploadDir = resolve(process.cwd(), env.UPLOAD_DIR);

/**
 * 内网接口按媒体种类分了两个端点：音频走 /api/upload-media，图像和视频走 /api/upload。
 * 见 docs/接口文档.md。
 */
function remoteEndpoint(kind: MediaKind): string {
  const path = kind === "audio" ? "/api/upload-media" : "/api/upload";
  return `${env.UPLOAD_BASE_URL.replace(/\/$/, "")}${path}`;
}

function fallbackExt(kind: MediaKind): string {
  if (kind === "image") return ".png";
  if (kind === "video") return ".mp4";
  return ".mp3";
}

/** 本地落盘。文件名用内容哈希，同一个文件重复上传直接复用，不会存两份 */
export async function storeLocally(file: File, kind: MediaKind): Promise<UploadedFile> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const hash = createHash("sha256").update(buffer).digest("hex");
  // 扩展名只用来让浏览器认出类型，不参与去重
  const ext = extname(file.name).toLowerCase().slice(0, 10) || fallbackExt(kind);
  const stored = `${hash}${ext}`;
  const target = resolve(uploadDir, stored);

  const duplicate = existsSync(target);
  if (!duplicate) {
    await mkdir(uploadDir, { recursive: true });
    await writeFile(target, buffer);
  }

  return {
    filename: stored,
    url: `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/uploads/${stored}`,
    status: duplicate ? "duplicate" : "uploaded",
    duplicate,
  };
}

/** 转发到内网上传服务，原样把它的结果传回去 */
export async function storeRemotely(file: File, kind: MediaKind): Promise<UploadedFile> {
  const form = new FormData();
  form.append("file", file, file.name);
  if (env.REQ_FROM) form.append("req_from", env.REQ_FROM);

  const res = await fetch(remoteEndpoint(kind), { method: "POST", body: form });
  if (!res.ok) throw new Error(`内网上传服务返回 ${res.status}`);

  const body = (await res.json()) as { files?: UploadedFile[]; success?: boolean };
  const uploaded = body.files?.[0];
  if (!body.success || !uploaded?.url) {
    throw new Error("内网上传服务未返回有效的文件地址");
  }
  return uploaded;
}

export function storeFile(file: File, kind: MediaKind): Promise<UploadedFile> {
  return env.UPLOAD_MODE === "proxy" ? storeRemotely(file, kind) : storeLocally(file, kind);
}
