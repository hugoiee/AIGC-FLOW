import {
  MAX_FILE_SIZE,
  MAX_FILES_PER_UPLOAD,
  mediaKindOf,
  type UploadedFile,
} from "@aigc-flow/shared";
import { Hono } from "hono";
import { storeFile } from "../uploads/storage";

function formatSize(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)}MB`;
}

export const uploadsRoute = new Hono().post("/", async (c) => {
  // Hono 的 parseBody 会把整个文件读进内存，所以 shared 里对单文件大小做了上限
  const body = await c.req.parseBody({ all: true });
  const raw = body.file ?? body.files;
  const files = (Array.isArray(raw) ? raw : [raw]).filter(
    (item): item is File => item instanceof File,
  );

  if (files.length === 0) {
    return c.json({ message: "没有收到文件，字段名应为 file" }, 400);
  }
  if (files.length > MAX_FILES_PER_UPLOAD) {
    return c.json({ message: `一次最多上传 ${MAX_FILES_PER_UPLOAD} 个文件` }, 400);
  }

  // 逐个处理并各自捕获：一个文件失败不该让整批都失败
  const results = await Promise.all(
    files.map(async (file): Promise<UploadedFile & { error?: string }> => {
      const kind = mediaKindOf(file.type, file.name);
      if (!kind) {
        return {
          filename: file.name,
          url: "",
          status: "error",
          duplicate: false,
          error: `不支持的文件类型：${file.type || "未知"}`,
        };
      }
      if (file.size > MAX_FILE_SIZE[kind]) {
        return {
          filename: file.name,
          url: "",
          status: "error",
          duplicate: false,
          error: `文件超过 ${formatSize(MAX_FILE_SIZE[kind])} 上限`,
        };
      }

      try {
        return await storeFile(file, kind);
      } catch (error) {
        console.error("[upload]", file.name, error);
        return {
          filename: file.name,
          url: "",
          status: "error",
          duplicate: false,
          error: error instanceof Error ? error.message : "上传失败",
        };
      }
    }),
  );

  return c.json({ files: results, success: results.every((item) => item.status !== "error") });
});
