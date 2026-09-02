# AIGC-FLOW

画布节点工作流，用于调用各种模型进行影视资产创作。

当前进度：首页（项目列表）、画布编辑器（`/projects/[id]`，React Flow）、
媒体上传（拖拽或按钮，图/视频/音频，经服务端转发到内网上传服务，
不落本地盘）已完成，`/debug` 是链路自检页。
画布操作：选择/移动双模式（V / H 切换）、框选、多选工具条
（整理节点 / 创建编组 / 对齐 / 间距 / 批量下载）、编组与解组、双击改节点名。
左下角的画布控制条是自己写的 `canvas-controls.tsx`（缩小 / 当前比例点开选档位 /
放大 / 适应画布 / 锁定 / 缩略图），不用 React Flow 自带的 `<Controls>`，样式和顶部、
底部的按钮组同一种胶囊风格但层级刻意更弱（底色更透、阴影更浅、图标次要色）。
比例档位最低 10%，所以 `minZoom` 是 0.1；右下角的 React Flow 角标用 `proOptions`
关掉了。
媒体节点只有右侧一个 source 端点，选中才显示。**所有连接端点都按 1/zoom 反向缩放**
（`gen-node-controls.tsx` 的 `handleScaleStyle`），画布缩小时在屏幕上保持 20px，否则缩到两成
只剩 4px 拉不出线；行内 transform 会盖掉 React Flow 自己给端点的 translate，所以那段要原样带上，
以中心为原点缩放，连线落点不动。选中时节点上方的信息条
（`node-info-bar.tsx`，名称 + 分辨率，媒体 / 生成 / 文本节点共用）、下方的 prompt 菜单、
右侧的功能面板都用 1/zoom 反向缩放，画布缩小时在屏幕上保持原大小。信息条的宽度
按内容自适应、不跟节点宽度走（跟节点走的话缩小后名字和尺寸会被截光或挤出去），
尺寸紧跟在名字后面靠左排。**编组暂不支持嵌套。**
图像生成节点（GPT Image 2 / Nano Banana 2 / Nano Banana Pro）和视频生成节点
（Seedance 2.0 / 2.5，参考图模式 + 首尾帧模式）都已接入内网 `/aigc`：
左侧 target 连参考素材（媒体节点或其他生成节点的结果，按图/视频/音频分流到
image_list / video_list / audio_list），结果显示在节点上方，右侧 source 可被
下游引用；`generating` 状态不落盘。版本/模式相关的参数收敛统一在 shared 的
`clampVideoConfig`。**首尾帧模式的 mode 值是占位的 `first_last_frame`**，
接口文档没写明，内网联调后改 `packages/shared/src/video-gen.ts` 一处即可。
上传和生成接口都要求 req_from（设置面板里填），不填服务端直接拒绝。
文本节点（Textarea）连给生成节点后在 prompt 里显示为琥珀色徽章（显示节点名，
悬停看正文；和三种素材徽章的绿 / 蓝 / 紫区分开）：prompt 存
`{{text:<节点id>}}` token（数据契约，见 `packages/shared/src/text-node.ts`），
输入框是 contentEditable（`prompt-editor.tsx`），发请求前按 token 位置替换成
文本内容。提示词多到出滚动条时输入框右下角露出「放大」按钮（`onExpand`），点了由
生成节点把**整个浮动菜单**（参考素材 + 提示词 + 底部选项 + 生成按钮）放大成盖住画面的
弹层（`gen-menu-dialog.tsx`）；节点里和弹层里是同一个 `renderMenu(large)` 渲染的两份，
弹层里的编辑器不传 `onExpand` 防套娃。
**@ 菜单是 portal 到 body 的**，Dialog 打开时 body 是 `pointer-events:none`，菜单要自己
`pointer-events-auto`；点菜单不能算「点到弹层外面」（`onInteractOutside` 里按
`[role="listbox"]` 放行）；Escape 先收 @ 菜单再关弹层（编辑器里 `stopPropagation`）。连线增删与 token 同步的规则：新连线追加到末尾、断线移除、
手动删掉徽章不补回（断线重连可重新插入）。
**「不补回」是靠 `usePromptTokens` 的挂载守卫实现的：首次运行一律视为已同步。**
所以「节点带着连线一起诞生」的路径（菜单里当场建生成节点）必须由创建方
把 token 直接写进 prompt，交给这个 hook 去追永远追不上。
prompt 里还能用 **@ 引用参考素材**：输入 `@` 弹出已连入本节点的素材列表（媒体节点的
图 / 视频 / 音频，或上游生成节点的结果，按节点名过滤），选中后插入
`{{image:<节点id>}}` / `{{video:…}}` / `{{audio:…}}` token（契约见
`packages/shared/src/media-ref.ts`），徽章显示节点名并按种类配色（图片绿、音频蓝、
视频紫），悬停出预览（图片缩略图 / 视频静音画面 / 音频只有图标）。几种 token 共用
`prompt-token.ts` 的通用操作（粘贴重写 id、按节点 id 移除）。发请求前
`resolveMediaRefs` 把徽章换成带序号的占位符 `<<<image1>>>` / `<<<video1>>>` /
`<<<audio1>>>`（`mediaPlaceholderOf`），序号就是这份素材在对应列表（image_list /
video_list / audio_list）里的位置（从 1 数起）；列表保持连线顺序不动，引用只是告诉
模型「用列表里的第几个」，同一份引用几次列表里都只有一份。
**占位符序号必须和实际发出的列表对应**，所以三个列表也由 `usePromptTokens`
按各自上限截断后一起给出（`urls`），节点别自己再从 sources 拼一份。
不在列表里的引用（断线、没上传完、超出上限）发请求时直接移除。
**占位符格式是按用户口述定的，内网联调后若有出入只改 `media-ref.ts` 一处。**
素材徽章不随连线自动插入（@ 是显式动作），断线时移除、手动删掉不补回，
和文本徽章同一套挂载守卫。
连线约束在 `lib/connection.ts`：图像节点只收图/文本，视频节点收图/视频/音频/文本，
生成节点的产出算对应种类资源。连线可以直接落在目标节点身上（不必碰左侧端点）。
多选资源时选区右侧有浮动连线端点（`floating-connector.tsx`）：落到可接受节点上
批量连线，落到空白或不能接受的节点上会在松手处弹节点选择菜单
（`node-picker-menu.tsx`，不能连的类型禁用，选择后原地建节点并接线，期间虚线不消失）；
单个资源节点从右侧端点拉线落空 / 落错时同样弹这个菜单（`onConnectEnd` 里判断，React Flow
自己的连线松手即消失，用浮动连线那条虚线接着画，起点是 `connectionState.from` 换屏幕坐标）；
右键画布空白也弹这个菜单（因此选择模式的平移只剩中键和空格+左键，右键让给了菜单；
空格是 React Flow 的 `panActivationKeyCode` 默认值，白捡的）。
连线动画用 motion（`animated-edge.tsx`，描边生长后淡出）。
每次转发 `/aigc` 都在 `generations` 表记一条流水（完整请求 JSON、状态、
视频时长），**按项目归属**（`project_id`，生成请求必带 `projectId`，两个生成节点从
`useCanvasActions().projectId` 拿）。右上角的数据统计面板（`stats-dialog.tsx`）只汇总
当前画布的次数与视频总秒数（自动时长的不计入、单独计数），供按项目核算开销；
`GET /api/generations?projectId=<id>`，不带 projectId 是全局口径（含加列前的老记录）。
删项目不删流水：删除路由先把该项目流水的 `project_id` 置空再删（连接开着
`foreign_keys`，迁移里的外键没带 ON DELETE，不先解开会被约束挡住）。
**节点标记**：素材类节点（媒体 / 图像生成 / 视频生成）可标成「采用 / 废弃」，
不标就是「还没审」（三态，刻意不做星级和颜色标签）。契约在
`packages/shared/src/node-mark.ts`（`data.mark`），客户端只有 `lib/node-mark.ts` 一份判断
（`nodeMarkOf` / `markableIds` / `markNodes`），能打标的判据和批量下载同一个 `nodeMediaOf`。
画布上废弃的素材整块压暗去色 + 左上角灰叉角标，采用只有一个绿色对勾角标
（`node-mark-badge.tsx`，1/zoom 反向缩放）。入口两个：单击节点右侧功能面板的两个开关，
和多选工具条的「标记」下拉（选中编组时作用于组内成员）；没有快捷键。
标记只是信息、不是锁：废弃的照样能连线当参考、照样会被批量下载，只在 prompt 的
素材徽章上划线 + title 提示、预览卡标题带「（已废弃）」（`PromptMediaRef.rejected`），
生成节点菜单里的参考素材缩略格同样灰显 + 小叉（`ChipRejectedMark`）。
左上角信息组有三个计数芯片「采用 / 废弃 / 待审」（`markSummary`，待审 = 有素材但没打标），
点击选中该态的全部素材节点（`idsByMark`，只改 selected、不进历史），接着就能批量下载。
**刻意不做**「隐藏废弃」开关和「删除所有废弃」：要清理就点「废弃」芯片选中后按 Delete。
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
- **画布上的输入框不要把 `value` 直接绑到 node data**，否则中文输入法必坏。
  值绕经 React Flow 的 store 再回流是滞后的，React 一旦发现 `value` 属性和 DOM
  里的值对不上就会写回去，而**组词过程中改写 `value` 会摧毁 composition 区** ——
  浏览器把下一次组词当成新文本插到光标处，「中文」会打成 `zzhzhozhonzhong中wwewen文`。
  正确写法：编辑期间用本地 `draft` state 驱动 `value`（同一次渲染内更新，值永远
  等于 DOM，React 不会写回），进编辑时取一次初值，`onChange` 再同步给 node data；
  并用 `compositionstart/end` 把组词中间态挡在 graph 之外（拼音会顺着连线跑进
  生成节点的徽章）。`text-node.tsx` 是样板，`node-name` / `project-name` 同款。
  contentEditable 的 `prompt-editor.tsx` 不受影响 —— 它回写的就是 `serialize(el)`，
  回流值和 DOM 天然一致，那个 `serialize(el) !== value` 的判断不会成立。
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
- **视频节点的 `nodrag` 要按指针位置动态挂**（`lib/video-drag.ts`）。`<video controls>`
  不挂 `nodrag` 的话拖进度条会变成拖节点；整块都挂上则节点没地方可拖 —— 表现就是
  占位符能拖、出了视频反而拖不动。原生控件在 shadow DOM 里、事件重定向到 `<video>`
  本身，靠 `event.target` 分不出点的是画面还是控件，只能按 `offsetY` 分。
  必须走 **capture 阶段**（React Flow 的拖拽监听在节点元素上、冒泡阶段，
  合成事件挂在根容器，capture 才来得及）且**同步改 DOM 类名**（setState 是异步的，
  等重渲染完这次 pointerdown 早处理完了）。`offsetY` 不受画布缩放影响，不用除 zoom。
- 注册了自定义组件的内置类型（比如 `group`）仍然会套 React Flow 的默认样式，
  `.react-flow__node-group` 的白底 / 边框 / padding 要在 `globals.css` 里清掉。
- **画布上别用 `bg-muted` 做区分底色**：浅色画布底是 `#F5F5F5`（`globals.css` 的
  `.react-flow.light`），和 `--muted`（oklch 0.97）几乎同值，铺上去看不出来。
  要和画布拉开的中性填充走 `bg-foreground/<n>`（编组是 `bg-foreground/8 dark:bg-muted`，
  深色下 muted 比画布亮两档，够用）。
- **节点标记跟结果走，不跟节点走**：生成节点点「生成」进入 generating 的那个 patch 里
  就把 `mark` 清掉（旧标记是给上一张打的，且 generating 时旧结果已经不显示）。
  以后做结果历史（n>1）时 mark 应挪进每条结果记录里，现在放节点 data 上只是过渡。
  打标要进撤销栈：节点内发起的走 `canvasActions.setNodeMark`（同 `renameNode`），
  工具条批量的走 `applyLayout(markNodes)`；`markNodes` 一个都没变时返回原数组，
  调用方据此跳过入栈。prompt 徽章不是 React 渲染的，废弃状态变化和改名走同一条
  `useEffect` 同步路径（`syncRejected` 直接改 DOM 类名）。
- **「节点身上有没有素材」只有一份判断**：`lib/node-media.ts` 的 `nodeMediaOf()`，
  媒体节点看 `url`、生成节点看 `resultUrl`，都要求 `status === "ready"`。
  参考素材列表和批量下载共用它。这个判断以前散在三个文件里各写一遍，
  批量下载那份只认媒体节点，生成的图和视频一直下不下来 —— 加新的产出型节点
  （比如音频生成）时改这一处就够，别再抄第四份。
- 浏览器只放行一个页面的第一个自动下载，之后的会弹窗让用户确认。批量下载就是
  逐个触发 + 让用户点一次「允许」，**不要为了绕过它去做服务端打包**。
- **下载要在各自的隐藏 iframe 里发起，不能用 `<a download>` 点击**（`lib/download.ts`
  的 `downloadViaFrame`）。API 和页面不同源，`download` 属性会被忽略、点击变成顶层
  导航，而同一 frame 里新导航会取消还没收到响应头的旧导航。服务端要先等上游
  bcebos 回头才应答，冷连接 300ms 内回不了，于是一批里只有最后一个成活 ——
  症状是「第一次批量下载只下一张，再来一次全下来」（第二次连接已复用）。
  iframe 里的导航一旦转成下载就和 iframe 无关了，但下载型导航不触发 `load`，
  所以只能靠超时摘 iframe；`load` 触发说明返回的是报错页，直接摘。
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
- **生成转发不能用 Node 全局 `fetch`**（`routes/generate.ts`）。内网 `/aigc` 是同步阻塞式的，
  受算力影响单次 10-30 分钟才回，而全局 fetch 底层 undici 默认 `headersTimeout` /
  `bodyTimeout` 都是 300 秒，5 分钟没等到响应头就抛 `fetch failed`（cause 是
  `HeadersTimeoutError`），以前被一律报成「连不上内网生成服务」—— 症状是配置和网络都正常、
  慢一点的生成却偶发连不上。现在用 `undici` 包自己的 `fetch` + 显式 `Agent`
  （两个等待超时设 0 关掉，只留 10 秒建连超时），**dispatcher 和 fetch 必须来自同一份 undici**，
  别把 npm 的 Agent 塞给全局 fetch。报错按 `error.cause.code` 分：建连类错误码才说「连不上」，
  其余如实带出错误码。上传转发（`routes/uploads.ts`）仍用全局 fetch，那边几秒就回，不用改。
- 对外部服务的请求一律经 Hono 转发，不让浏览器直连内网地址（避 CORS、
  内网 IP 不进前端 bundle、凭据只在服务端填一处）。上传就是这个模式的样板：
  前端只调本服务的 `/api/uploads`，服务端转发到内网上传服务
  （图/视频走 `/api/upload`，音频走 `/api/upload-media`）。
  **转发出去的表单字段是 `files`（复数）加 `req_from`**，写成 `file` 或漏掉
  `req_from` 内网都会拒；本服务自己的 `/api/uploads` 两种字段名都收。
  **两个端点的返回都是 `{ files: [{ url, status }], success }`，不是文档里
  写的 `{ urls: [...] }`**，而且 `status` 有 `duplicate`（按内容哈希去重命中
  了已有文件，照样给地址，算成功）—— 所以解析时认地址不认状态，别去枚举
  状态白名单。内网根地址不在 .env 里，存 `settings` 表
  （画布右上角设置面板可改）。**内网地址没有默认值、不进仓库**：三个接口地址在
  `packages/shared/src/settings.ts` 里都是空串，首次启动后必须在设置面板里填，
  没填之前上传和生成都会被服务端以 400 拦下。

## 下一步

- 嵌套编组：目前选区含编组或组内节点时按钮置灰，要支持得处理多层坐标变换、
  递归解组、递归收集组内素材。
- 音频生成节点；图像生成的多张结果（n>1）与结果历史。
- 单选下载：媒体 / 图像生成 / 视频生成节点单击后右侧浮出功能面板
  （`node-action-panel.tsx`，下载 + 全屏 + 原样复制 + 采用 / 废弃），单个下载走
  `lib/download.ts` 的 `downloadItemOf`。后续单节点的功能都往这个面板里加。
  原样复制走 `canvasActions.duplicateNode`：抄节点本身（含结果和标记）和从上游过来的
  连线，上游节点不动、下游连线不抄，副本偏移 40px 压在原节点上并成为唯一选中 / active 的
  节点。prompt 里的徽章 token 指向的是上游节点 id，上游没变所以原样有效。多选工具条的批量下载阈值
  （`SELECTION_TOOLBAR_MIN = 2`）不要动 —— 排布、编组那几个按钮对单个节点没意义。
- 首尾帧模式的 mode 取值待内网联调确认（当前占位 first_last_frame）。
- 本地调试没有内网时，可用一个 mock `/aigc` 服务替代（POST 返回
  `{result:{content:[url],status:"success"}}`），把设置面板的生成地址指过去即可。

按 `coding_new_feat` 五步法逐个功能推进。
