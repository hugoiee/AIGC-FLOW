import type { AppType } from "@aigc-flow/server/app-type";
import { hc } from "hono/client";

/**
 * 后端地址。空串表示前后端同源（桌面端：Next 的静态导出由内嵌的 Hono 一起托管），
 * 此时 hono client 走相对路径。web 部署下是独立的 server 地址。
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/**
 * Hono RPC 客户端：接口类型直接从 apps/server 推导。
 * 改了后端路由 / 入参，这里的调用点会在 typecheck 时直接飘红。
 */
export const api = hc<AppType>(API_BASE);
