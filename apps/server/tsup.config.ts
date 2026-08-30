import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // 原生模块不参与打包，运行时从 node_modules 解析
  external: ["better-sqlite3"],
});
