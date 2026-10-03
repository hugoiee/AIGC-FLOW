import type { NextConfig } from "next";

/**
 * DESKTOP=1 是 Electron 打包用的构建模式：静态导出，前端由内嵌的 Hono 同源托管。
 * 不设这个变量时行为和以前完全一致，web 部署不受影响。
 */
const desktop = process.env.DESKTOP === "1";

const nextConfig: NextConfig = {
  // workspace 内的包直接引用 TS 源码，交给 Next 编译
  transpilePackages: ["@aigc-flow/shared"],
  // 导出成 out/projects/index.html，配合 serveStatic 的目录索引，
  // 省掉 assetPrefix / .html 重写那套 hack
  ...(desktop ? { output: "export" as const, trailingSlash: true } : {}),
  env: {
    // 桌面端前后端同源，置空让 hono client 走相对路径（"" 不是 nullish，?? 不会兜底上来）
    NEXT_PUBLIC_API_URL: desktop
      ? ""
      : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"),
  },
};

export default nextConfig;
