# 侧边栏可用调试入口开发文档

## 背景

`pnpm dev:sidebar` 已能通过 WXT 自动启动临时 Chrome 并加载扩展，但 runner 未配置启动地址，Chrome 只显示 `about:blank`。此外 Side Panel API 只能在用户手势中打开，不能在后台启动时直接调用。开发者因此看不到明确的调试入口。

## 目标

执行 `pnpm dev:sidebar` 后，浏览器直接打开一个本地调试落地页；按一次快捷键即可打开扩展 Side Panel。整个流程不需要手动加载、重新加载或管理临时扩展。

## 实施步骤

1. 在扩展的静态资源目录新增本地调试落地页，并将它设为 WXT Chromium runner 的 `startUrls`。
2. 在扩展清单注册 `Ctrl+Shift+Y` 调试快捷键，避开 Windows 常见的 `Alt+Shift` 输入法切换。
3. 在后台命令事件中用该快捷键的用户手势调用 `sidePanel.open`，同时保留工具栏图标点击打开侧边栏的行为。
4. 增加配置与后台连接回归测试，防止启动页或快捷键再次缺失。
5. 用独立临时端口运行 WXT，确认启动页不再是 `about:blank`，并执行类型检查、测试和 Chrome MV3 构建。
6. 清理临时调试进程，更新版本/开发记录并创建本地 Git 提交。

## 验收标准

- `pnpm dev:sidebar` 自动打开本地调试落地页，不显示 `about:blank` 或 404。
- `Ctrl+Shift+Y` 能从当前标签页打开扩展 Side Panel。
- 工具栏扩展图标仍可打开 Side Panel。
- 类型检查、单元测试与 Chrome MV3 生产构建通过。
