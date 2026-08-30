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
- 局域网管理后台：`http://<本机局域网 IP>:56993/`（例如 `http://192.168.15.22:56993/`）
- 侧边栏插件开发页：http://localhost:56992/
- Rust API：http://127.0.0.1:26626/

管理后台会监听所有网络接口，并通过开发代理访问仅监听本机的 Rust API；局域网设备无需直接访问 API 端口。

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

默认情况下 Floccus 的 passphrase 只由客户端管理。若要在管理后台整理加密书签，可输入同一个 passphrase 解锁；服务端会用独立主密钥加密保存它，并在内存中解密 XBEL 后重新以 Floccus 兼容格式写回。启用该功能后不再是零知识加密，拥有数据库、同步文件和服务器主密钥的管理员能够解密书签。

服务器主密钥优先从 `BOOKMARK_VAULT_MASTER_KEY` 读取（32 字节标准 Base64）。未配置时会在 `data/server-master.key` 自动生成；部署和备份时必须将该文件与 SQLite 数据库一起保护和备份。主密钥丢失后，可在后台重新输入 Floccus passphrase 恢复管理能力。生产环境必须启用 HTTPS，并为每个浏览器使用独立应用密码。
