const { readdirSync, rmSync } = require("node:fs");
const { join } = require("node:path");

/** electron-builder 的 Arch 枚举是数字，转回名字 */
const ARCH = { 0: "ia32", 1: "x64", 2: "armv7l", 3: "arm64", 4: "universal" };

/**
 * better-sqlite3 13 的 npm 包自带 8 个平台的 .node（约 26MB），只有一个用得上。
 *
 * 不在 electron-builder.yml 的 files 里裁，是因为那里的 ${platform} 宏解析成的是
 * **构建主机**的平台而不是目标平台 —— 在 mac 上打 win 包时它是 darwin，
 * win 包里就装进了 darwin-x64.node，装到 Windows 上必崩，而且在 mac 上完全测不出来。
 * （改用平台级 files 加回来也不行，实测 prebuilds 整个目录会丢。）
 *
 * afterPack 拿到的 electronPlatformName 是真正的目标平台，命名恰好和 better-sqlite3
 * 的 darwin / win32 / linux 一致。
 */
exports.default = async function pruneBuilds(context) {
  const platform = context.electronPlatformName;
  const arch = ARCH[context.arch] ?? String(context.arch);
  const keep = `${platform}-${arch}.node`;

  const resources =
    platform === "darwin"
      ? join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources")
      : join(context.appOutDir, "resources");
  const dir = join(resources, "app.asar.unpacked", "node_modules", "better-sqlite3", "prebuilds");

  const all = readdirSync(dir);
  if (!all.includes(keep)) {
    // 留不下正确的那个就等于打了个必崩的包，宁可让构建失败
    throw new Error(`[prune-prebuilds] ${dir} 里没有 ${keep}，实际有：${all.join(", ")}`);
  }

  let freed = 0;
  for (const name of all) {
    if (name === keep) continue;
    rmSync(join(dir, name));
    freed++;
  }
  console.log(`  • prune-prebuilds  kept=${keep} removed=${freed}`);
};
