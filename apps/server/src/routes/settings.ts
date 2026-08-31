import { appSettingsSchema } from "@aigc-flow/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { getUploadBaseUrl, setUploadBaseUrl } from "../db/settings";

export const settingsRoute = new Hono()
  .get("/", (c) => c.json({ uploadBaseUrl: getUploadBaseUrl() }))
  .put("/", zValidator("json", appSettingsSchema), (c) => {
    const { uploadBaseUrl } = c.req.valid("json");
    setUploadBaseUrl(uploadBaseUrl);
    return c.json({ uploadBaseUrl });
  });
