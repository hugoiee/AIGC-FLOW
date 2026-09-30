import type { DesktopBridge, DesktopWindowState } from "@aigc-flow/shared";
import { contextBridge, ipcRenderer } from "electron";

const desktop: DesktopBridge = {
  windowState: () => ipcRenderer.invoke("desktop:window-state"),
  onWindowState(listener) {
    const receive = (_event: Electron.IpcRendererEvent, state: DesktopWindowState) =>
      listener(state);
    ipcRenderer.on("desktop:window-state", receive);
    return () => ipcRenderer.removeListener("desktop:window-state", receive);
  },
  appearance: (dark, title, followSystem) =>
    ipcRenderer.invoke("desktop:appearance", dark, title, followSystem),
  confirmClose: (question) => ipcRenderer.invoke("desktop:confirm-close", question),
  beforeWindowClose(save) {
    const receive = (_event: Electron.IpcRendererEvent, token: string) => {
      void Promise.resolve()
        .then(save)
        .then(
          (saved) => ipcRenderer.send("desktop:close-response", token, saved),
          () => ipcRenderer.send("desktop:close-response", token, false),
        );
    };
    ipcRenderer.on("desktop:close-request", receive);
    return () => ipcRenderer.removeListener("desktop:close-request", receive);
  },
  onTabShortcut(listener) {
    const receive = (_event: Electron.IpcRendererEvent, action: "next" | "previous" | "close") =>
      listener(action);
    ipcRenderer.on("desktop:tab-shortcut", receive);
    return () => ipcRenderer.removeListener("desktop:tab-shortcut", receive);
  },
};
contextBridge.exposeInMainWorld("desktop", desktop);
