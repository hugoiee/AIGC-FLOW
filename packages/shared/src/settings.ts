import { z } from "zod";

/** 内网上传服务的默认根地址（docs/接口文档.md），设置面板可改 */
export const DEFAULT_UPLOAD_BASE_URL = "http://10.75.202.161:8511";

/** 全局设置。目前只有内网上传服务根地址一项 */
export const appSettingsSchema = z.object({
  uploadBaseUrl: z
    .url({ protocol: /^https?$/, error: "请输入 http(s) 开头的完整地址" })
    .transform((value) => value.replace(/\/+$/, "")),
});

export type AppSettings = z.infer<typeof appSettingsSchema>;
