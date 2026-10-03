import { serveStatic } from "@hono/node-server/serve-static";
import type { Hono as HonoType } from "hono";
import { Hono } from "hono";

/**
 * 把现有的 API 应用和 Next 的静态导出产物包成同一个 origin。
 *
 * 同源之后一次性消掉三件事：CORS（同源请求没有 Origin 头，app.ts 的 cors 中间件不设头也不拦）、
 * NEXT_PUBLIC_API_URL 的 build 期内联（置空后 hono client 直接走相对路径）、
 * 以及 file:// 下那套 assetPrefix / trailingSlash 的 hack。
 *
 * 不直接往 apps/server 的 app 上挂静态托管，是因为它的 notFound 返回 JSON 404，
 * 而且那条链式 .route() 是 AppType 的来源，动不得。
 */
export function createShell(honoApp: HonoType, webRoot: string) {
  return (
    new Hono()
      // 原始 Request 原样转发：shell 上不挂 logger，body 不会被中间件消费，
      // multipart 流和 30 分钟的长请求都完好
      .all("/api/*", (c) => honoApp.fetch(c.req.raw))
      // serveStatic 是 join(root, path)，绝对路径可用，目录自动补 index.html；
      // root 不存在时它会 console.error，那条日志是 T6 排查白屏的主要线索
      .use("*", serveStatic({ root: webRoot }))
      // 静态资源没命中就回首页，交给客户端路由
      .all("*", (c) => c.redirect("/"))
  );
}
