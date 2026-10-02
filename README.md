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
