# 侧边栏自动调试浏览器开发文档

## 背景

侧边栏扩展的 `pnpm dev:sidebar` 当前只启动 WXT/Vite 模块服务，并因 `webExt.disabled` 被设置为 `true` 而禁止 WXT 启动浏览器调试 runner。开发者只能手动进入扩展管理页加载产物，且误将 localhost 端口当作应用页面时会看到 404。

## 目标

执行 `pnpm dev:sidebar` 后，WXT 自动启动独立的 Chrome 调试实例并临时加载侧边栏扩展；源文件改动继续通过 WXT 热更新机制同步到该实例。

## 实施步骤

1. 移除禁用 WXT `webExt` runner 的配置，让 `wxt` 使用内置的 Chromium runner。
2. 增加回归测试，确保调试 runner 不会被再次禁用。
3. 使用备用端口启动一次 WXT 开发服务，验证它成功启动调试浏览器；验证后停止该临时服务与浏览器。
4. 执行侧边栏类型检查、单元测试与 Chrome MV3 构建。
5. 更新开发记录并创建本地 Git 提交，不推送远程仓库。

## 验收标准

- `pnpm dev:sidebar` 不再输出“手动加载未打包扩展”的提示。
- WXT 输出成功打开浏览器，并以临时加载方式运行扩展。
- 类型检查、单元测试和 Chrome MV3 构建全部通过。
