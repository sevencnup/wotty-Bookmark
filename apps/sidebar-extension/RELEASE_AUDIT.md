# 扩展发布包审计

审计日期：2026-10-11

审计任务：`floating-bookmark-sidebar`

审计结论：`CHROME BUILD PASSED · STORE PERMISSION REVIEW REQUIRED`

## 产物范围

| 发布目标 | 构建命令 | 产物目录 | 入口 |
| --- | --- | --- | --- |
| Chrome Stable | `pnpm --filter @bookmark-vault/sidebar-extension build` | `.output/chrome-mv3` | MV3 内容脚本 + 悬浮扩展页面 |
| Edge Stable | 使用 Chrome MV3 产物 | `.output/chrome-mv3` | MV3 内容脚本 + 悬浮扩展页面 |
| Firefox Stable | `pnpm --filter @bookmark-vault/sidebar-extension build:firefox` | `.output/firefox-mv2` | MV2 内容脚本 + 悬浮扩展页面 |

Edge 使用 Chromium MV3 包；Firefox 需独立构建并在真实浏览器验收。

## 当前权限与数据边界

| 检查项 | 当前状态 | 说明 |
| --- | --- | --- |
| 页面访问范围 | 需商店审核 | 为在普通网页持续显示边缘按钮，扩展声明 `http://*/*` 和 `https://*/*`，并在这些页面运行内容脚本。浏览器内部页和不可注入页面不显示按钮。 |
| 内容脚本行为 | 受限于界面注入 | 内容脚本只检查自身挂载点并插入/移除悬浮按钮和扩展 iframe，不读取网页正文、表单、Cookie 或浏览历史。 |
| 网页可访问资源 | 限定资源 | 普通网页只可嵌入 `sidebar-frame.html`、所需脚本分块和品牌图标；iframe 仍运行在扩展来源下以使用现有扩展 API。 |
| `bookmarks`、`tabs`、`storage` | 保留 | `bookmarks` 按来源模式读写浏览器书签；`tabs` 读取当前页标题和地址并打开用户选择的书签；`storage` 保存设置和连接令牌。 |
| 远程代码 | 未引入 | 悬浮 UI 使用扩展包内脚本。服务器来源模式会向用户配置的 WOTTY BOOKMARK API 请求书签数据；浏览器来源模式读取浏览器原生书签。 |
| 页面宽度 | 不修改 | 浮层使用固定定位覆盖网页，不改变宿主页面宽度、边距或滚动位置。 |
| 浏览器兼容性 | 待真实浏览器验收 | 普通 HTTP/HTTPS 页面支持悬浮入口；浏览器内部页面和禁止扩展注入的页面不支持。 |

## 本次验证范围

开发文档要求构建 Chrome MV3 并核对清单中的内容脚本、网页可访问资源和原生 Side Panel 配置。未运行单元测试，也未在真实浏览器中验收；商店提交前必须完成 Chrome、Edge 和 Firefox 的交互检查。

## 提交前清单

- [ ] 确认 Chrome Web Store、Edge Add-ons 和 Firefox Add-ons 接受全站 HTTP/HTTPS 注入权限，并在商店资料中清楚说明用途。
- [ ] 将 Firefox `gecko.id` 替换为正式唯一扩展 ID。
- [ ] 添加商店要求尺寸的 PNG 图标和真实浮层截图，截图不得包含个人书签、账号、地址或测试凭据。
- [ ] 将 [`PRIVACY.md`](PRIVACY.md) 发布到公开 HTTPS 页面，并在商店资料中填写。
- [ ] 填写支持页面、主页和开发者联系方式。
- [ ] 在 Chrome、Edge、Firefox 稳定版加载生产包，检查边缘开关、浮层开合、书签搜索与增删改操作。
