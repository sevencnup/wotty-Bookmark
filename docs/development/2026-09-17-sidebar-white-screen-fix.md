# 侧边栏白屏修复开发文档

## 背景

运行 `pnpm dev:sidebar` 后加载生成的 Chromium 扩展，点击工具栏图标打开 Side Panel 时页面全白。

## 已确认原因

WXT 开发产物中的 `sidepanel.html` 会从 `http://localhost:56992` 导入 Vite 模块，但 Side Panel 的页面来源是 `chrome-extension://<extension-id>`。开发服务器响应未携带 `Access-Control-Allow-Origin`，浏览器会拒绝执行跨源模块，导致侧栏根节点保持为空白。

同时，严格类型检查还暴露了国际化优化条件、文件夹选择器选项模型及虚拟列表索引访问不安全问题；这些问题一并修复，避免后续回归。

## 实施步骤

1. 在 WXT 的 Vite 开发服务器中显式启用 CORS，使扩展页面可加载 localhost 开发模块。
2. 用不依赖 `WeakMap.size` 的状态标记保留中文界面的跳过优化。
3. 将文件夹选择器的输入类型收窄到其实际使用的字段，并让树形选项携带层级深度。
4. 为虚拟列表的受限索引补充安全处理，恢复严格 TypeScript 检查。
5. 添加与本次回归对应的单元测试，验证 CORS、类型检查、扩展测试和 Chrome MV3 构建。
6. 更新侧边栏版本记录与开发记录，并创建本地 Git 提交；不推送远程仓库。

## 验收标准

- 开发服务器的模块响应包含 CORS 许可，扩展 Side Panel 可加载。
- 侧边栏国际化初始化不再依赖 `WeakMap.size`。
- `pnpm --filter @bookmark-vault/sidebar-extension typecheck` 通过。
- `pnpm --filter @bookmark-vault/sidebar-extension test` 通过。
- `pnpm --filter @bookmark-vault/sidebar-extension build` 通过，并生成可加载的 Chrome MV3 扩展。
