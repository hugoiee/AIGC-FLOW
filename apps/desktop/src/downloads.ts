import { existsSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { app, Notification, session, shell } from "electron";

/**
 * Electron 默认对**每一个**下载都弹一次「另存为」，批量下载 4 个素材就是 4 个弹窗。
 * 浏览器里从来不是这个行为（只在第一个之后问一次「允许下载多个文件」，之后直接落到
 * 下载目录），所以这里接管掉，全部自动存进系统下载目录。
 *
 * 代价是下载变得无声无息 —— 桌面端没有浏览器那条下载栏。所以一批下完补一条系统通知，
 * 点开就是下载目录。
 */

/** 已经许给某个下载、但文件还没落盘的路径，防止同批次内互相覆盖 */
const reserved = new Set<string>();

let pending = 0;
let completed: string[] = [];
let failed = 0;

export function autoSaveDownloads() {
  session.defaultSession.on("will-download", (_event, item) => {
    const target = reservePath(app.getPath("downloads"), item.getFilename());
    item.setSavePath(target);

    pending++;
    item.once("done", (_e, state) => {
      reserved.delete(target);
      if (state === "completed") completed.push(target);
      else failed++;

      pending--;
      // 批量下载是逐个触发的（lib/download.ts 里隔 300ms），归零就是这一批下完了
      if (pending === 0) report();
    });
  });
}

function report() {
  const ok = completed.length;
  const bad = failed;
  const first = completed[0];
  completed = [];
  failed = 0;

  if (ok === 0 && bad === 0) return;

  console.log(`下载完成 ${ok} 个${bad ? `，失败 ${bad} 个` : ""}`);
  if (!Notification.isSupported()) return;

  const notification = new Notification({
    title: bad === 0 ? `已下载 ${ok} 个文件` : `已下载 ${ok} 个，${bad} 个失败`,
    body: "点击打开下载文件夹",
  });
  notification.on("click", () => {
    // 有成功的就顺便把它选中，让用户一眼看到下到哪儿了
    if (first) shell.showItemInFolder(first);
    else void shell.openPath(app.getPath("downloads"));
  });
  notification.show();
}

/**
 * 挑一个不撞车的落盘路径，并当场占住。
 *
 * 会撞车是因为存盘名取的是节点名（lib/download.ts 的 downloadItemOf），而节点名可以重复
 * —— 一次选中两个都叫「素材」的节点很正常。同批次的下载几乎同时开始，光靠 existsSync
 * 看不到还没建出来的文件，所以另外用 reserved 记一份。
 */
function reservePath(dir: string, rawName: string): string {
  const name = sanitize(rawName);
  const ext = extname(name);
  const stem = basename(name, ext);

  let candidate = join(dir, name);
  for (let i = 1; existsSync(candidate) || reserved.has(candidate); i++) {
    candidate = join(dir, `${stem} (${i})${ext}`);
  }
  reserved.add(candidate);
  return candidate;
}

/** 节点名是用户双击改的，可能带路径分隔符或 Windows 不收的字符 */
function sanitize(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/^\.+/, "")
    .trim();
  return cleaned || "下载文件";
}
