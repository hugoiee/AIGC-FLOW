import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

let logFile: string | null = null;

/**
 * 打包之后没人看得到 stdout —— 主进程的所有输出必须同时落一份文件，
 * 否则「启动即白屏」这类问题完全没法排查（T6 的四条失败线全靠它定位）。
 */
export function initLog(userData: string): string {
  logFile = join(userData, "logs", "main.log");
  mkdirSync(dirname(logFile), { recursive: true });

  for (const level of ["log", "warn", "error"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      write(level, args);
    };
  }

  return logFile;
}

function write(level: string, args: unknown[]) {
  if (!logFile) return;
  const line = args
    .map((a) =>
      typeof a === "string" ? a : a instanceof Error ? (a.stack ?? a.message) : JSON.stringify(a),
    )
    .join(" ");
  try {
    appendFileSync(logFile, `${new Date().toISOString()} [${level}] ${line}\n`);
  } catch {
    // 日志写不进去不该让应用挂掉
  }
}
