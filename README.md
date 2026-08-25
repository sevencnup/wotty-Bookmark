# Bookmark Vault

自部署浏览器书签同步服务，首期通过官方 Floccus + WebDAV 工作。

## 当前进度

- 管理后台注册、登录、应用密码和存储状态：已实现。
- Rust API 健康检查和 PostgreSQL 迁移：已实现。
- WebDAV 锁、临时文件、MOVE 原子替换和文件元数据：已实现。
- 书签侧边栏扩展 Chrome 构建：已实现；Firefox 适配和跨浏览器验收：待完成。
- 侧边栏插件：由独立开发窗口实现。

## 本地启动管理后台

在 `/code` 根目录执行：

```bash
pnpm install
pnpm --filter @bookmark-vault/admin-web dev
```

Rust API：

```bash
cd services/api
cargo run
```

## 安全边界

Floccus 的 passphrase 由客户端管理，服务端不保存。生产环境必须启用 HTTPS，并为每个浏览器使用独立应用密码。
