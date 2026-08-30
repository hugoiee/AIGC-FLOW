# AIGC-FLOW

画布节点工作流，用于调用各种模型进行影视资产创作。

当前进度：首页（项目列表，含空状态 / 新建 / 删除）已完成，
`/debug` 是链路自检页。画布编辑器（`/projects/:id`）与模型调用尚未开发。
核心实体是 **project**，一个项目对应一张节点画布（扁平模型，没有中间层）。

## 常用命令

在仓库根目录执行（pnpm workspaces）：

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 同时启动 client(3000) 与 server(3001) |
| `pnpm dev:client` / `pnpm dev:server` | 只启动其中一端 |
| `pnpm build` | 全量构建（server 用 tsup，client 用 next build） |
| `pnpm typecheck` | 三个包逐个 `tsc --noEmit` |
| `pnpm lint` / `pnpm lint:fix` | Biome 检查 / 自动修复 |
| `pnpm db:generate` | 改完 `schema.ts` 后生成迁移 SQL |
| `pnpm db:migrate` | 应用迁移到 SQLite 文件 |
| `pnpm db:studio` | Drizzle Studio 可视化查库 |

## 目录结构

```
apps/
  client/                Next.js 16 App Router（端口 3000）
    src/app/             页面路由，layout.tsx + page.tsx
    src/components/      业务组件
    src/components/ui/   shadcn/ui 生成组件（不要手改，用 CLI 重新生成）
    src/lib/api.ts       Hono RPC 客户端，接口类型来自 apps/server
    src/lib/utils.ts     shadcn 的 cn()
  server/                Hono（端口 3001）
    src/app.ts           路由挂载 + 导出 AppType（给前端做类型推导）
    src/index.ts         @hono/node-server 启动入口
    src/env.ts           zod 校验环境变量
    src/routes/          按资源拆分的路由文件
    src/db/schema.ts     Drizzle 表定义（唯一数据源真相）
    src/db/index.ts      SQLite 连接（WAL 模式）
    drizzle/             生成的迁移 SQL，不要手写
    data/                SQLite 单文件，已 gitignore
packages/
  shared/src/            前后端共用的 zod schema 与类型，直接导出 TS 源码
```

## 技术约束

- 包管理器只用 **pnpm**，新增依赖必须带 `--filter`，例如
  `pnpm --filter @aigc-flow/client add xxx`；根目录只放工具链依赖。
- TypeScript 固定 **5.9.3**（不要升 7.x，工具链尚未普遍适配）。
- 所有包继承根 `tsconfig.base.json`：`strict` + `noUncheckedIndexedAccess`
  + `verbatimModuleSyntax`（类型导入必须写 `import type`）。
- 代码规范只用 **Biome**，不要引入 ESLint / Prettier。双引号、分号、
  行宽 100、2 空格缩进，import 顺序由 Biome 自动整理。
- 样式只用 **Tailwind v4**，不写独立 CSS 文件；颜色一律走 shadcn 的语义
  token（`bg-background` / `text-muted-foreground` 等），不要硬编码色值。
- 组件优先 `pnpm dlx shadcn@latest add <name>` 生成，再包一层业务组件。

## 前后端联通（重要）

前端不手写 fetch，统一走 `src/lib/api.ts` 的 Hono RPC：

```ts
const res = await api.api.projects.$post({ json: { name } });
```

因此 `apps/server/src/app.ts` 里的路由**必须保持链式调用**：

```ts
const app = new Hono().use(...).route("/api/health", healthRoute).route("/api/projects", projectsRoute);
export type AppType = typeof app;
```

拆成多条 `app.route(...)` 语句会让 `AppType` 退化，前端类型推导直接失效。

## 编码规范

- 文件名 kebab-case（`project-card.tsx`），组件名 PascalCase。
- Next.js 默认写 Server Component；需要状态/事件时才加 `"use client"`，
  并把 client 组件下沉到叶子节点。
- 接口出入参的校验 schema 写在 `packages/shared`，前后端共用同一份。
- 数据库字段改动流程：改 `schema.ts` → `pnpm db:generate` → `pnpm db:migrate`，
  不要手写 SQL 或直接改 `drizzle/` 里的文件。
- 新增时间字段一律用 `schema.ts` 里的 `isoNow`（带 Z 的 ISO 8601 UTC），
  **不要用 `CURRENT_TIMESTAMP`** —— 它没有时区标记，前端 `new Date()` 会按本地时区解析而偏移。
- 参与 SSR 的工具函数必须是纯函数（如 `project-cover.tsx` 的 `hashName`），
  不要用 `Math.random()` / `Date.now()`，否则 hydration 不匹配。

## 下一步

画布功能（React Flow / @xyflow/react）、模型调用适配层尚未引入，
按 `coding_new_feat` 五步法逐个功能推进。
