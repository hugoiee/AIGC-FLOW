# AIGC-FLOW
画布节点工作，用于调用各种模型进行影视资产创作

## 桌面项目标签页

Electron 桌面端使用 48px 全高标签栏，保留原生窗口控制。点击项目首页中的卡片打开
项目；再次打开同一项目会切换到已有标签。Home 返回首页，项目标签可拖动排序、点击
`×` 关闭。顶部不提供 Open Project 或 All Open Project 按钮。

每个画布在当前窗口中保持挂载，切换保留视角、选择、撤销栈和未提交输入。隐藏画布
暂停媒体播放，并禁用画布快捷键和删除键；后台生成仍能完成并自动保存。

关闭标签前会完成保存。保存失败可以取消、重试或明确放弃更改；任务进行中会先确认。
关闭当前标签后选中最近访问的项目，关闭最后一个标签返回首页。关闭窗口或退出应用
会检查所有已打开项目。关闭标签不会删除项目，打开的标签与排序仅保留在本次窗口会话。

快捷键：`Ctrl+Tab` / `Ctrl+Shift+Tab` 切换项目，`⌘/Ctrl+W` 关闭当前项目标签。

## 验证

```sh
pnpm typecheck
pnpm lint
pnpm --filter @aigc-flow/desktop test
pnpm --filter @aigc-flow/server exec node --import tsx --test ../client/src/lib/graph.test.ts
pnpm --filter @aigc-flow/desktop build:web
AIGC_TEST_WEB="$PWD/apps/client/out" pnpm --filter @aigc-flow/desktop test:smoke
```

Electron 集成测试使用临时用户目录、内存项目 API 和模拟生成请求，不连接用户数据库
或付费模型。测试覆盖项目去重、切换保留状态、快捷键隔离、拖动排序、主题与窄窗口、
后台生成、保存失败取消关闭以及关闭窗口前保存全部项目，并在临时目录生成截图。

若构建环境限制 Turbopack 的子进程绑定端口，可以使用 Next.js 官方 webpack 构建器：

```sh
DESKTOP=1 pnpm --filter @aigc-flow/client exec next build --webpack
```

Windows 的原生 Window Controls Overlay 和高 DPI 行为需要在 Windows 实机确认。

## 版本发布

更新内容见 [CHANGELOG.md](CHANGELOG.md)。根目录和四个 workspace 包的版本号保持一致，
安装包版本取自 `apps/desktop/package.json`。

1. 从最新 `dev` 创建 `chore/release-<version>`，更新版本号和更新记录，完成上述验证，
   通过 PR 合并回 `dev`。
2. 从 `dev` 发起到 `main` 的发布 PR，评审并合并后，在该 `main` 提交上创建版本标签
   （例如 `v0.2.0`），标签版本必须与包版本一致。
3. 推送版本标签触发 `.github/workflows/release.yml`，分别构建 macOS arm64 / x64 的
   DMG、ZIP，以及 Windows x64 的 EXE。也可以对已验证的提交手动运行该工作流。
4. 两个平台构建成功后，在 Actions 中下载 `dist-macos-latest` 和 `dist-windows-latest`
   产物，核对安装包版本并完成实机安装验证，再使用同一标签和更新说明发布 GitHub Release。

当前工作流只上传 Actions 构建产物，不会自动创建 GitHub Release；合并 `main` 本身也不会
触发打包。只有版本标签或手动运行工作流才触发构建。
