import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // workspace 内的包直接引用 TS 源码，交给 Next 编译
  transpilePackages: ["@aigc-flow/shared"],
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
  },
};

export default nextConfig;
