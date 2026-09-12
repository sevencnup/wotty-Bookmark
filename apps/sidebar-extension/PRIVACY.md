# WOTTY BOOKMARK Sidebar 隐私说明

生效日期：2026-08-25

WOTTY BOOKMARK Sidebar 主要管理用户自有服务器上的书签库。用户可以在管理后台生成一次性连接码，让侧边栏读取当前账户的服务器书签索引；连接码兑换为受限于本应用 API 的会话令牌，侧边栏不保存 WebDAV 应用密码、登录密码或 Floccus passphrase。跨浏览器同步仍由官方 Floccus 负责。

## 访问的数据

- 扩展通过 WOTTY BOOKMARK API 读取和管理当前账户的服务器书签树，并执行用户发起的新增、编辑、移动和删除操作。
- 扩展通过浏览器 `tabs` API 读取当前活动标签页的标题和地址，用于“收藏当前页面”和打开用户选择的书签。
- 扩展不读取网页正文、表单、密码、Cookie 或浏览历史。

## 数据传输和存储

- 连接后台后，扩展只向用户配置的 WOTTY BOOKMARK 服务请求书签索引和连接状态。
- 扩展不直接使用 WebDAV，也不保存 WebDAV 应用密码、登录密码或 Floccus passphrase。
- 书签数据由 WOTTY BOOKMARK 服务器书签库管理；扩展本地只保存连接令牌。

## 权限用途

- `tabs`：读取当前活动页面并在用户打开书签时创建标签页。
- `storage`：保存一次性连接码兑换后的后台会话令牌。
- Chrome/Edge 的 `sidePanel`：提供浏览器侧边栏入口。
- Firefox 的 `sidebar_action`：提供 Firefox 侧边栏入口。

## 联系和变更

本说明会随扩展功能或数据处理方式变化而更新。正式商店提交前，项目维护者应将此文件发布到商店要求的公开 HTTPS 隐私政策地址，并在各商店资料中填写该地址。
