import { type AppSettings, appSettingsSchema, maskApiKey } from "@aigc-flow/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { getAppSettings, setAppSettings } from "../db/settings";

/**
 * 对外的设置形状：**真 API Key 不出服务端**。
 * `llmApiKey` 一律回空串（输入框从空开始，空 = 不改动），
 * 另给一个只读的 `llmApiKeyPreview` 让面板能显示「已配置成 sk-…abcd」。
 */
function toSettingsView(value: AppSettings) {
  return { ...value, llmApiKey: "", llmApiKeyPreview: maskApiKey(value.llmApiKey) };
}

export const settingsRoute = new Hono()
  .get("/", (c) => c.json(toSettingsView(getAppSettings())))
  .put("/", zValidator("json", appSettingsSchema), (c) => {
    setAppSettings(c.req.valid("json"));
    // 回存完后的视图，而不是入参：入参里的 key 是空的，掩码得按落盘结果重算
    return c.json(toSettingsView(getAppSettings()));
  });
