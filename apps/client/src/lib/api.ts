import type { AppType } from "@aigc-flow/server/app-type";
import { hc } from "hono/client";

/**
 * Hono RPC 客户端：接口类型直接从 apps/server 推导。
 * 改了后端路由 / 入参，这里的调用点会在 typecheck 时直接飘红。
 */
export const api = hc<AppType>(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001");
