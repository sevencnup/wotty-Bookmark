# 商店资料草案

以下内容用于 Chrome Web Store、Microsoft Edge Add-ons 和 Firefox Add-ons 的提交资料。正式提交前需要替换带有“待填写”标记的字段。

## 基础资料

- 产品名：WOTTY BOOKMARK Sidebar
- 简短描述：Search and organize bookmarks in a floating sidebar over any webpage.
- 分类：生产力
- 支持平台：Chrome Stable、Microsoft Edge Stable、Firefox Stable（桌面版）
- 隐私政策 URL：待填写（公开 HTTPS 地址，内容见 [`PRIVACY.md`](PRIVACY.md)）
- 支持页面 URL：待填写
- 项目主页 URL：待填写

## 详细描述

WOTTY BOOKMARK Sidebar adds a small button to the edge of regular web pages. Open a searchable bookmark workspace as a floating overlay without resizing or pushing the page. Search folders and URLs, save the current page, create or edit bookmarks, move items, delete items, and reorder the tree with drag and drop.

Choose browser-native bookmarks, which remain in the browser and can sync through the official Floccus extension, or connect to your WOTTY BOOKMARK server library. The extension does not connect to WebDAV directly; Floccus remains responsible for browser-native bookmark synchronization and encryption.

## 权限说明

| 权限 | 商店说明 |
| --- | --- |
| `bookmarks` | Read and manage the bookmarks selected by the user in the browser's native bookmark system. |
| `tabs` | Read the active tab title and URL to offer “save current page”, and open a bookmark in a new tab when the user selects it. |
| `storage` | Store extension settings and the configured server connection token. |
| Host access to HTTP/HTTPS pages | Add the edge toggle and display the extension's floating iframe. The content script does not read webpage content. |

## 数据披露

- 数据收集：无
- 数据销售：无
- 第三方数据共享：无
- 远程代码：无
- 广告和分析：无

## 发布素材待办

- [ ] 生成并提交 16/32/48/128 像素图标。
- [ ] 准备 Chrome、Edge、Firefox 悬浮侧栏截图，截图不得含个人书签、账号、地址或测试凭据。
- [ ] 确认 Firefox 正式唯一扩展 ID，替换 `wxt.config.ts` 中的占位 ID。
- [ ] 填写隐私政策、支持页、主页和开发者联系方式。
- [ ] 从干净生产构建目录创建每个商店的压缩包，不包含测试文件、源代码、`.wxt`、`node_modules` 或开发配置。
