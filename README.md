# WOTTY BOOKMARK

自部署浏览器书签同步服务，首期通过官方 Floccus + WebDAV 工作。

## 当前进度

- 管理后台注册、登录、应用密码和存储状态：已实现。
- Rust API 健康检查和 SQLite 迁移：已实现。
- WebDAV 锁、临时文件、MOVE 原子替换和文件元数据：已实现。
- 书签侧边栏扩展 Chrome 构建：已实现；Firefox 适配和跨浏览器验收：待完成。
- 侧边栏插件：由独立开发窗口实现。

## 本地启动开发服务

在仓库根目录执行：

```bash
pnpm install
pnpm dev
```

按 `Ctrl+C` 会同时停止 Rust API 和管理后台，不会自动打开浏览器。

默认只启动本地 Rust API 和管理后台：

- 管理后台：http://localhost:56993/
- Rust API：http://127.0.0.1:26626/

侧边栏不是同步链路的必需服务，需要开发侧边栏时另开终端执行：

```bash
pnpm dev:sidebar
```

SQLite 数据库默认保存在 `data/bookmark-vault.sqlite`，不需要单独安装或启动数据库服务。

若只启动管理后台，可使用 `pnpm dev:frontend` 或 `pnpm dev:admin`。

## 本地启动管理后台

在 `/code` 根目录执行：

```bash
pnpm install
pnpm --filter @bookmark-vault/admin-web dev
```

Rust API（仅需单独调试后端时）：

```bash
cd services/api
cargo run
```

## 安全边界

Floccus 的 passphrase 由客户端管理，服务端不保存。生产环境必须启用 HTTPS，并为每个浏览器使用独立应用密码。
