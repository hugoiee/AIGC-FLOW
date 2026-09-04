import { join } from "node:path";
import { app } from "electron";

/**
 * 打包后随包分发、但必须以「原样文件」躺在磁盘上的资源（走 electron-builder 的 extraResources）。
 *
 * 迁移 SQL 不能内联成字符串：drizzle 的 readMigrationFiles 要求 meta/_journal.json 存在，
 * 并对每个 .sql 的原文取 sha256 当幂等键，内联会丢掉整个 journal 机制、升级时重复执行。
 *
 * ⚠️ dev 下不能用 process.resourcesPath —— 它指向 node_modules 里那份预编译 Electron。
 */
function resourceRoot(): string {
  // __dirname 在 dev 下是 apps/desktop/dist，往上两级到 apps/
  return app.isPackaged ? process.resourcesPath : join(__dirname, "..", "..");
}

export function migrationsFolder(): string {
  const root = resourceRoot();
  return app.isPackaged ? join(root, "drizzle") : join(root, "server", "drizzle");
}

export function webRoot(): string {
  const root = resourceRoot();
  return app.isPackaged ? join(root, "web") : join(root, "client", "out");
}
