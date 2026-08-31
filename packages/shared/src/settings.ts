import { z } from "zod";

/** 内网上传服务的默认根地址（docs/接口文档.md），设置面板可改 */
export const DEFAULT_UPLOAD_BASE_URL = "http://10.75.202.161:8511";

/** 内网生成服务（/aigc）的默认根地址，注意和上传服务不是同一个端口 */
export const DEFAULT_GENERATE_BASE_URL = "http://10.75.202.161:8204";

const baseUrlSchema = z
  .url({ protocol: /^https?$/, error: "请输入 http(s) 开头的完整地址" })
  .transform((value) => value.replace(/\/+$/, ""));

/** 全局设置。都存服务端 settings 表，设置面板可改 */
export const appSettingsSchema = z.object({
  uploadBaseUrl: baseUrlSchema,
  generateBaseUrl: baseUrlSchema,
  /** 内网生产接口要求的请求来源标识（如 v_zhangsan）。上传接口不需要 */
  reqFrom: z.string().trim().max(100),
});

export type AppSettings = z.infer<typeof appSettingsSchema>;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  uploadBaseUrl: DEFAULT_UPLOAD_BASE_URL,
  generateBaseUrl: DEFAULT_GENERATE_BASE_URL,
  reqFrom: "",
};
