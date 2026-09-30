import type { CloseChoice } from "@aigc-flow/shared";
import { type BrowserWindow, dialog, ipcMain, nativeTheme } from "electron";
import { isCloseQuestion } from "./tab-model";

export function installDesktopWindowApi(window: BrowserWindow) {
  const allowed = (event: Electron.IpcMainInvokeEvent) =>
    event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame;
  const state = () => ({ platform: process.platform, fullscreen: window.isFullScreen() });
  const publish = () => window.webContents.send("desktop:window-state", state());
  window.on("enter-full-screen", publish);
  window.on("leave-full-screen", publish);
  window.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.control && input.key === "Tab") {
      event.preventDefault();
      window.webContents.send("desktop:tab-shortcut", input.shift ? "previous" : "next");
    }
  });
  ipcMain.handle("desktop:window-state", (event) => (allowed(event) ? state() : null));
  ipcMain.handle(
    "desktop:appearance",
    (event, dark: unknown, title: unknown, followSystem: unknown) => {
      if (
        !allowed(event) ||
        typeof dark !== "boolean" ||
        typeof title !== "string" ||
        typeof followSystem !== "boolean"
      )
        return;
      window.setTitle(title.slice(0, 240));
      nativeTheme.themeSource = followSystem ? "system" : dark ? "dark" : "light";
      window.setBackgroundColor(dark ? "#141414" : "#f5f5f5");
      if (process.platform !== "darwin")
        window.setTitleBarOverlay({
          height: 48,
          color: dark ? "#505050" : "#e5e5e5",
          symbolColor: dark ? "#fafafa" : "#0a0a0a",
        });
    },
  );
  ipcMain.handle("desktop:confirm-close", async (event, request: unknown): Promise<CloseChoice> => {
    if (!allowed(event) || !isCloseQuestion(request)) return "cancel";
    const running = request.reason === "running";
    const { response } = await dialog.showMessageBox(window, {
      type: "warning",
      message: running ? `「${request.projectName}」仍有任务进行中` : "更改尚未保存",
      detail: running
        ? "关闭标签后，正在执行的请求可能继续，但结果将无法回填此画布。"
        : `「${request.projectName}」未能保存。请重试保存后关闭，或放弃未保存的更改。`,
      buttons: running ? ["取消", "仍然关闭"] : ["取消", "重试保存并关闭", "放弃更改"],
      defaultId: 0,
      cancelId: 0,
    });
    return response === 0 ? "cancel" : running || response === 2 ? "discard" : "retry";
  });
  window.on("closed", () => {
    for (const name of ["window-state", "appearance", "confirm-close"])
      ipcMain.removeHandler(`desktop:${name}`);
  });
}
