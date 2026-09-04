import type { ServerType } from "@hono/node-server";
import { serve } from "@hono/node-server";
import type { Hono } from "hono";

/** 端口被占时最多往后试几个 */
const MAX_ATTEMPTS = 5;

export type ListenResult = { server: ServerType; port: number; fellBack: boolean };

/**
 * 探一下这个端口上跑的是不是另一份我们自己。
 *
 * /api/health 返回 {status, db, uptime, timestamp}，形状足够特征化。
 * 命中说明是另一份安装（dev 版和打包版的 userData 不同，各自持有单实例锁，
 * 两边能同时起来），这时候不该换端口 —— 换了会变成两个进程各开各的库，
 * 用户以为在同一个应用里操作，实际数据分家。
 */
async function isOurself(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as Record<string, unknown>;
    return typeof body.status === "string" && "db" in body && "uptime" in body;
  } catch {
    return false;
  }
}

function listenOnce(app: Hono, port: number): Promise<ServerType> {
  return new Promise((resolve, reject) => {
    // 绑 127.0.0.1 而不是 0.0.0.0：后者在 Windows 上会弹防火墙授权框，
    // 而且会让局域网内任何人都能读写这台机器的项目库
    const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => {
      server.off("error", reject);
      resolve(server);
    });
    server.once("error", reject);
  });
}

/**
 * 从 basePort 开始找一个能用的端口。
 *
 * 返回 fellBack=true 表示没抢到首选端口 —— 调用方要告诉用户，因为 origin 变了
 * 就意味着 localStorage 换了一个隔离域，画布剪贴板会从空的开始。
 * 静默降级比报错更糟：用户会以为剪贴板坏了。
 */
export async function listenWithFallback(
  app: Hono,
  basePort: number,
  onConflict: () => void,
): Promise<ListenResult> {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const port = basePort + i;
    try {
      const server = await listenOnce(app, port);
      return { server, port, fellBack: i > 0 };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EADDRINUSE") throw err;
      if (i === 0 && (await isOurself(port))) {
        onConflict();
        // onConflict 负责提示并退出，这里不再往下试
        return await new Promise<never>(() => {});
      }
      console.warn(`⚠️  端口 ${port} 被占用，试下一个`);
    }
  }
  throw new Error(`端口 ${basePort}-${basePort + MAX_ATTEMPTS - 1} 都被占用了`);
}
