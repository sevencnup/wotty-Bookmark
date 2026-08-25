# Bookmark Vault

自部署浏览器书签同步服务，首期通过官方 Floccus + WebDAV 工作。

## 当前进度

- 管理后台工程骨架：已创建。
- Rust API 健康检查：已创建。
- WebDAV、账户和应用密码：开发中。
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
