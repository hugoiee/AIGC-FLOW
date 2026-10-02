import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "unit/projects": "src/tab-model.test.ts",
    "unit/persistence": "../client/src/lib/save-queue.test.ts",
    smoke: "tests/workspace-smoke.ts",
    preload: "src/preload.ts",
  },
  outDir: "dist/tests",
  format: ["cjs"],
  target: "node22",
  clean: false,
  external: ["electron"],
  removeNodeProtocol: false,
  outExtension: () => ({ js: ".cjs" }),
});
