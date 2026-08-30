import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  /** SQLite 单文件路径，相对 apps/server 目录 */
  DATABASE_URL: z.string().default("./data/aigc-flow.db"),
  /** 允许跨域的前端地址，逗号分隔 */
  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  /**
   * 上传模式。
   * local：落盘到 UPLOAD_DIR，返回本机可访问的 URL —— 没有内网时用这个开发。
   * proxy：转发到公司内网的上传服务。
   */
  UPLOAD_MODE: z.enum(["local", "proxy"]).default("local"),
  /** proxy 模式下的内网上传服务根地址 */
  UPLOAD_BASE_URL: z.string().default("http://10.75.202.161:8511"),
  /** 内网接口要求所有请求都带 req_from */
  REQ_FROM: z.string().default(""),
  /** local 模式的落盘目录，相对 apps/server */
  UPLOAD_DIR: z.string().default("./data/uploads"),
  /** 前端拿到的 URL 前缀，local 模式下拼在文件名前面 */
  PUBLIC_BASE_URL: z.string().default("http://localhost:3001"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("环境变量校验失败:", z.treeifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
export const corsOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim());
