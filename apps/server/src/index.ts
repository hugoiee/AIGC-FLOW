import { serve } from "@hono/node-server";
import { app } from "./app";
import { dbPath } from "./db";
import { env } from "./env";

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`🚀 server  http://localhost:${info.port}`);
  console.log(`🗄  sqlite  ${dbPath}`);
});
