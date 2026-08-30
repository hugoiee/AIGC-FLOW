import { serve } from "@hono/node-server";
import { app } from "./app";
import { dbPath } from "./db";
import { env } from "./env";

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`🚀 server  http://localhost:${info.port}`);
  console.log(`🗄  sqlite  ${dbPath}`);
});

// 默认情况下 listen 失败会抛出 Node 的 "Unhandled 'error' event" 裸堆栈，
// 看不出该怎么处理。这里换成能直接照做的提示。
server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      [
        "",
        `❌ 端口 ${env.PORT} 已被占用，server 无法启动。`,
        "",
        "   多半是上一次的 dev 进程没退干净。查一下是谁占着：",
        `     lsof -nP -iTCP:${env.PORT} -sTCP:LISTEN`,
        "   确认无误后结束它：",
        `     kill $(lsof -t -nP -iTCP:${env.PORT} -sTCP:LISTEN)`,
        "",
        `   或者换个端口：PORT=3002 pnpm dev:server（记得同步 client 的 NEXT_PUBLIC_API_URL）`,
        "",
      ].join("\n"),
    );
    process.exit(1);
  }
  throw err;
});

// tsx watch / Ctrl-C 时干净地放掉端口，避免下次启动再撞 EADDRINUSE
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
  });
}
