import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  /** SQLite 单文件路径，相对 apps/server 目录 */
  DATABASE_URL: z.string().default("./data/aigc-flow.db"),
  /** 允许跨域的前端地址，逗号分隔 */
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("环境变量校验失败:", z.treeifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
export const corsOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim());
