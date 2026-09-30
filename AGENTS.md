# 仓库指南

## 项目结构与模块组织

AIGC-FLOW 是一个 pnpm workspace 单仓库：

- `apps/client/`：Next.js 16 前端。页面在 `src/app/`，业务组件和画布逻辑在 `src/components/` 与 `src/lib/`。
- `apps/server/`：Hono API 服务。路由在 `src/routes/`，Drizzle/SQLite 代码在 `src/db/`，生成的迁移文件在 `drizzle/`。
- `apps/desktop/`：Electron 主进程与打包配置。
- `packages/shared/`：客户端和服务端共用的 Zod schema 与 TypeScript 契约。

新代码应放在负责该行为的包中；跨包共用的 schema 放入 `packages/shared`。

## 构建、测试与开发命令

使用 Node 22+ 与 pnpm 11：

- `pnpm install`：安装依赖；CI 使用 `pnpm install --frozen-lockfile`。
- `pnpm dev`：同时启动前端和服务端；也可使用 `pnpm dev:client` 或 `pnpm dev:server` 单独启动。
- `pnpm build`：构建所有包；`pnpm typecheck`：执行 TypeScript 类型检查。
- `pnpm lint`：运行 Biome 检查；`pnpm lint:fix`：应用修复；`pnpm format`：格式化文件。
- `pnpm db:generate`：schema 变更后生成 Drizzle 迁移；`pnpm db:migrate`：执行迁移。
- `pnpm desktop`：构建并启动 Electron；使用 `pnpm dist:mac` 或 `pnpm dist:win` 打包发布版本。

仓库当前没有自动化测试套件。请至少运行类型检查和 Biome，并对受影响的功能做针对性手动验证。

## 代码风格与命名约定

使用 2 个空格缩进、LF 换行、双引号、分号、尾随逗号，行宽限制为 100 列。Biome 是唯一的格式与检查工具，不要新增 ESLint 或 Prettier。文件名使用 kebab-case（如 `project-card.tsx`），React 组件使用 PascalCase。仅类型导入使用 `import type`。优先复用共享 schema 和类型化 Hono RPC，避免重复校验或在客户端手写 `fetch`。

## 测试指南

新增测试时，将测试放在所属包附近，并以被验证的行为命名。至少运行 `pnpm typecheck` 和 `pnpm lint`；涉及 UI、Electron 或生成流程的改动，应在 PR 中写明手动验证步骤。

## 提交与拉取请求规范

遵循现有 Conventional Commit 风格，例如 `feat(canvas): ...`、`fix(llm): ...` 或 `ci: ...`。每个提交应聚焦单一变更。PR 需要说明改动内容、涉及的包和验证命令；如适用请关联 issue，UI 改动附截图或录屏，并明确说明数据库迁移、环境变量或发布相关影响。

## 安全与配置

不要提交凭据、带签名的媒体 URL、本地 SQLite 数据或发布产物。根据各目录中的 `.env.example` 配置本地服务。外部服务请求统一经服务端转发，避免将密钥和内网地址带入前端构建产物。