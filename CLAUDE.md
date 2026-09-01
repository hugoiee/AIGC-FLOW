# AIGC-FLOW

画布节点工作流，用于调用各种模型进行影视资产创作。

当前进度：首页（项目列表）、画布编辑器（`/projects/[id]`，React Flow）、
媒体上传（拖拽或按钮，图/视频/音频，经服务端转发到内网上传服务，
不落本地盘）已完成，`/debug` 是链路自检页。
画布操作：选择/移动双模式（V / H 切换）、框选、多选工具条
（整理节点 / 创建编组 / 对齐 / 间距 / 批量下载）、编组与解组、双击改节点名。
媒体节点只有右侧一个 source 端点，选中才显示。**编组暂不支持嵌套。**
这块的完整决策记录和踩坑见 `docs/画布操作逻辑.md`。
图像生成节点（GPT Image 2 / Nano Banana 2 / Nano Banana Pro）和视频生成节点
（Seedance 2.0 / 2.5，参考图模式 + 首尾帧模式）都已接入内网 `/aigc`：
左侧 target 连参考素材（媒体节点或其他生成节点的结果，按图/视频/音频分流到
image_list / video_list / audio_list），结果显示在节点上方，右侧 source 可被
下游引用；`generating` 状态不落盘。版本/模式相关的参数收敛统一在 shared 的
`clampVideoConfig`。**首尾帧模式的 mode 值是占位的 `first_last_frame`**，
接口文档没写明，内网联调后改 `packages/shared/src/video-gen.ts` 一处即可。
上传和生成接口都要求 req_from（设置面板里填），不填服务端直接拒绝。
文本节点（Textarea）连给生成节点后在 prompt 里显示为徽章：prompt 存
`{{text:<节点id>}}` token（数据契约，见 `packages/shared/src/text-node.ts`），
输入框是 contentEditable（`prompt-editor.tsx`），发请求前按 token 位置替换成
文本内容。连线增删与 token 同步的规则：新连线追加到末尾、断线移除、
手动删掉徽章不补回（断线重连可重新插入）。
**「不补回」是靠 `usePromptTokens` 的挂载守卫实现的：首次运行一律视为已同步。**
所以「节点带着连线一起诞生」的路径（菜单里当场建生成节点）必须由创建方
把 token 直接写进 prompt，交给这个 hook 去追永远追不上。
连线约束在 `lib/connection.ts`：图像节点只收图/文本，视频节点收图/视频/音频/文本，
生成节点的产出算对应种类资源。连线可以直接落在目标节点身上（不必碰左侧端点）。
多选资源时选区右侧有浮动连线端点（`floating-connector.tsx`）：落到可接受节点上
批量连线，落到空白或不能接受的节点上会在松手处弹节点选择菜单
（`node-picker-menu.tsx`，不能连的类型禁用，选择后原地建节点并接线，期间虚线不消失）；
右键画布空白也弹这个菜单（因此选择模式的平移只剩中键和空格+左键，右键让给了菜单；
空格是 React Flow 的 `panActivationKeyCode` 默认值，白捡的）。
连线动画用 motion（`animated-edge.tsx`，描边生长后淡出）。
每次转发 `/aigc` 都在 `generations` 表记一条流水（完整请求 JSON、状态、
视频时长），右上角的数据统计面板（`stats-dialog.tsx`）汇总次数与视频总秒数
（自动时长的不计入、单独计数），供成本核算；`GET /api/generations`。
音频生成节点尚未开发。
核心实体是 **project**，一个项目对应一张节点画布（扁平模型，没有中间层）。
整张图存在 `projects.graph` 这一个 JSON 列里，读写都是整体覆盖。

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
- **`setState` 的 updater 必须是纯函数**，任何副作用（写历史栈、发请求、读快照）
  都放到 updater 外面先算好再 set。React StrictMode 下 updater 会被调用两次，
  写在里面会静默执行两遍 —— 这个坑在首页的删除和画布的撤销上各踩过一次。
- 画布图数据落盘前必须过 `lib/graph.ts` 的 `toPersistedGraph()` 剥掉 React Flow 的
  瞬时状态（`selected` / `dragging` / `measured`），否则点选节点都会触发保存。
  它同时会过滤掉未上传完成的媒体节点及其悬空连线。
- **`naturalWidth` 量到的不一定是原图**：画布上渲染的常是 bcebos 的 CDN 缩略版
  （`resizedImageUrl` 会加 `x-bce-process=image/resize,w_1080`），这时 `<img>` 报的
  是缩略宽度，一张 4K 图会显示成 1080 宽。所以尺寸分两路取：**上传的素材在上传时
  就从本地 File 量好**（`use-media-upload.ts` 的 `measureLocalMedia`），**生成结果
  才靠 DOM 量**（生成地址带签名，`resizedImageUrl` 原样返回，渲染的就是原图）。
  判据统一是「渲染用的 src === 原始 url」，三个节点共用 `node-size.tsx`。
  注意**落位和显示的数字是两回事**：落位只要比例，缩略版的比例和原图一致，
  所以浏览器解不动本地文件时节点仍能正确落位，只是不显示尺寸数字。
- 判断文件类型用 `mediaKindOf(mimeType, filename)`，**不要只看 MIME**：
  部分容器格式（.mp4 / .mkv / .m4a）浏览器会给 `application/octet-stream` 甚至空串。
- **编组的子节点 position 是相对父节点的**，编组时减去组原点、解组时加回来，
  漏了哪一头节点都会飞走。排布操作（对齐 / 间距 / 整理）的选区必须先过
  `lib/group.ts` 的 `sameParentSelection()`，否则顶层节点和组内子节点混在一起
  算包围盒会得到垃圾数字。另外 React Flow 要求**父节点排在数组的子节点前面**，
  `fromPersistedGraph` 里统一重排过。
- **React Flow 的类名带双下划线，写不了 Tailwind 的 arbitrary variant** ——
  `[&_.react-flow__pane]` 里的 `_` 会被 Tailwind 当成空格，类名被拆开，规则根本
  生成不出来。这类样式只能写进 `globals.css`，而且**不能包在 `@layer` 里**：
  React Flow 的样式表是未分层的，按 CSS 级联规则未分层永远压过分层。
  现有的 `[data-canvas-mode="move"]` 那几条就是这个原因。
- **平移光标别只盯着 `.dragging`**：选择模式下两条平移路径挂的类不一样 ——
  按住空格会让 `panOnDrag` 变成 `true`，pane 挂 `.draggable` 且摘掉 `.selection`；
  中键是 `panOnDrag={[1]}`，而 React Flow 判 `draggable` 的条件是
  `panOnDrag === true || panOnDrag.includes(0)`，中键两条都不满足，**全程不挂
  `.draggable`**。所以「张开的手」只能挂在 `.draggable` 上（空格已按住、还没拖），
  「抓紧的手」挂 `.dragging`（两条路拖动中都有）。几条规则特异性相同，靠书写顺序
  定胜负，`.dragging` 必须排最后。拖动中划过节点不用另外处理 —— React Flow 会接管
  指针，`elementFromPoint` 命中的仍是 pane。
- 移动模式要「哪儿都能拖」，光设 `nodesDraggable={false}` 不够：节点本身要靠
  `elementsSelectable={false}` 让 React Flow 把它设成 `pointer-events:none`，
  多选时盖在选区上那层 `.react-flow__nodesselection-rect` 还得另外单独让开。
- 注册了自定义组件的内置类型（比如 `group`）仍然会套 React Flow 的默认样式，
  `.react-flow__node-group` 的白底 / 边框 / padding 要在 `globals.css` 里清掉。
- **「节点身上有没有素材」只有一份判断**：`lib/node-media.ts` 的 `nodeMediaOf()`，
  媒体节点看 `url`、生成节点看 `resultUrl`，都要求 `status === "ready"`。
  参考素材列表和批量下载共用它。这个判断以前散在三个文件里各写一遍，
  批量下载那份只认媒体节点，生成的图和视频一直下不下来 —— 加新的产出型节点
  （比如音频生成）时改这一处就够，别再抄第四份。
- 浏览器只放行一个页面的第一个自动下载，之后的会弹窗让用户确认。批量下载就是
  逐个触发 + 让用户点一次「允许」，**不要为了绕过它去做服务端打包**。
- **上传返回和生成返回是两种地址，别混着处理**。上传的是裸地址
  （`https://bd-spu-img.bj.bcebos.com/aigc_models_upload_img/<内容哈希>.png`），
  生成的带百度云签名 query：
  `https://wizstar-model-proxy.bj.bcebos.com/<hash>.png?authorization=bce-auth-v1/<AK>/<签发时间>/-1/host/<签名>`。
  几条推论：**① 拿后缀、比对地址一律先 `split("?")[0]`**（`lib/download.ts` 的
  `withExtension` 已经这么做），直接 `endsWith(".png")` 会漏；② 有效期那段是
  `-1`（不过期），所以生成结果的地址可以照常存进 `projects.graph`，不用做刷新
  或代理缓存；③ host 换了但仍是 `.bcebos.com` 子域，`routes/uploads.ts` 的
  `isAllowedSource` 后缀匹配能放行，批量下载不用改；④ 这个地址**带签名凭据**
  （AK + signature），别粘进仓库里的任何文件、issue 或提交信息。
- 对外部服务的请求一律经 Hono 转发，不让浏览器直连内网地址（避 CORS、
  内网 IP 不进前端 bundle、凭据只在服务端填一处）。上传就是这个模式的样板：
  前端只调本服务的 `/api/uploads`，服务端转发到内网上传服务
  （图/视频走 `/api/upload`，音频走 `/api/upload-media`，见 `docs/接口文档.md`）。
  **转发出去的表单字段是 `files`（复数）加 `req_from`**，写成 `file` 或漏掉
  `req_from` 内网都会拒；本服务自己的 `/api/uploads` 两种字段名都收。
  **两个端点的返回都是 `{ files: [{ url, status }], success }`，不是文档里
  写的 `{ urls: [...] }`**，而且 `status` 有 `duplicate`（按内容哈希去重命中
  了已有文件，照样给地址，算成功）—— 所以解析时认地址不认状态，别去枚举
  状态白名单。内网根地址不在 .env 里，存 `settings` 表
  （画布右上角设置面板可改，默认值在 `packages/shared/src/settings.ts`）。

## 下一步

- 嵌套编组：目前选区含编组或组内节点时按钮置灰，要支持得处理多层坐标变换、
  递归解组、递归收集组内素材。
- 音频生成节点；图像生成的多张结果（n>1）与结果历史。
- 单选一个节点时下不了：下载按钮挂在多选工具条上（`SELECTION_TOOLBAR_MIN = 2`），
  只选一个只能双击在新标签页打开原图。要支持得另找落点（节点悬浮按钮 / 右键菜单），
  不能直接把阈值降到 1 —— 排布、编组那几个按钮对单个节点没意义。
- 首尾帧模式的 mode 取值待内网联调确认（当前占位 first_last_frame）。
- 本地调试没有内网时，可用一个 mock `/aigc` 服务替代（POST 返回
  `{result:{content:[url],status:"success"}}`），把设置面板的生成地址指过去即可。

按 `coding_new_feat` 五步法逐个功能推进。
