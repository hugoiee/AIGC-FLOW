import { appSettingsSchema } from "@aigc-flow/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { getAppSettings, setAppSettings } from "../db/settings";

export const settingsRoute = new Hono()
  .get("/", (c) => c.json(getAppSettings()))
  .put("/", zValidator("json", appSettingsSchema), (c) => {
    const value = c.req.valid("json");
    setAppSettings(value);
    return c.json(value);
  });
