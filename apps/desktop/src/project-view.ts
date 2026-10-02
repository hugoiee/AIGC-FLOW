import { join } from "node:path";
import { BrowserWindow } from "electron";

/** All project canvases live in this window's React workspace. */
export function createProjectWindow() {
  return new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: "AIGC-FLOW",
    backgroundColor: "#f5f5f5",
    titleBarStyle: "hidden",
    autoHideMenuBar: true,
    ...(process.platform === "darwin"
      ? { trafficLightPosition: { x: 20, y: 18 } }
      : { titleBarOverlay: { height: 48, color: "#e5e5e5", symbolColor: "#0a0a0a" } }),
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
}
