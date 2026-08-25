# Bookmark Vault 开发执行计划

## 1. 文档评估结论

现有《BOOKMARK_VAULT_PROJECT_PLAN.md》的技术方向基本正确，但把两条产品路线写在了一起：

1. Floccus + WebDAV：复用官方 Floccus 完成书签读取、同步和冲突处理。
2. 自有加密同步插件：自己读取浏览器书签、实现加密保险库、事件日志和同步引擎。

如果首期目标是尽快得到可用产品，不能同时开发这两套同步系统。首期采用以下范围：

```text
Rust WebDAV 后端
        ↓
React + TypeScript 管理后台
        ↓ 配置应用密码和服务地址
官方 Floccus 插件
        ↓ 读取和同步浏览器原生书签
浏览器原生书签
        ↑
TypeScript 书签侧边栏插件
```

### 1.1 首期保留

- Rust + Axum 后端。
- PostgreSQL 账户和元数据存储。
- WebDAV 文件服务。
- Floccus 的 XBEL 文件同步。
- Floccus 客户端 passphrase 加密。
- React + TypeScript 管理后台。
- React + TypeScript 书签侧边栏插件。
- Docker Compose 自部署。

### 1.2 首期移除或延期

- 自有浏览器插件的云端同步逻辑。
- 自有加密事件协议。
- Argon2id + vaultKey 保险库。
- IndexedDB 同步队列。
- 自有冲突合并引擎。
- 服务端书签全文搜索。
- 多人共享书签。

侧边栏插件只操作浏览器原生书签，不访问 WebDAV，不保存第二份云端数据。Floccus 负责发现这些本地变化并同步。

## 2. 最终 MVP 范围

用户完成以下流程即视为 MVP 成功：

1. 打开管理后台并注册账号。
2. 登录后创建一个 WebDAV 应用密码。
3. 安装官方 Floccus。
4. 在 Floccus 中配置 WebDAV 地址、用户名、应用密码、书签文件名和 passphrase。
5. Floccus 在两个浏览器之间同步书签。
6. 安装 Bookmark Vault 侧边栏插件。
7. 从侧边栏搜索、新增、编辑、移动和删除书签。
8. 这些修改被 Floccus 自动同步到其他浏览器。

服务器只保存 Floccus 加密后的 XBEL 文件，不解析书签标题和 URL。

## 3. 技术和目录基线

### 3.1 技术选型

前端：

- TypeScript。
- React。
- Vite。
- WXT，用于侧边栏扩展构建。
- Tailwind CSS。
- TanStack Query。
- Zustand。
- Zod。
- Vitest。
- Playwright。

后端：

- Rust stable。
- Axum + Tokio。
- SQLx。
- PostgreSQL 16。
- `argon2`，用于管理后台账户密码和应用密码哈希。
- `tracing`，用于结构化日志。
- Caddy，负责 HTTPS 和反向代理。

首期不启用 Redis、WebSocket、MinIO 和 Prometheus。需要多实例部署时再增加 Redis 或对象存储。

### 3.2 目录结构

```text
/code/wotty-Bookmark/
├── package.json
├── pnpm-workspace.yaml
├── apps/
│   ├── admin-web/              # React + Vite + TypeScript
│   └── sidebar-extension/      # WXT + React + TypeScript
├── packages/
│   ├── protocol/               # 管理 API 类型、Zod schema、错误码
│   └── test-fixtures/          # 测试数据和协议测试素材
├── services/
│   └── api/                    # Rust + Axum + SQLx
│       ├── src/auth/
│       ├── src/admin_api/
│       ├── src/webdav/
│       └── src/storage/
├── migrations/
├── infra/
│   ├── docker-compose.yml
│   └── Caddyfile
├── docs/
└── tests/
    ├── webdav/
    ├── admin-e2e/
    └── floccus-e2e/
```

`admin-web` 和 `sidebar-extension` 加入根目录 `pnpm-workspace.yaml`。Node 依赖只在根目录执行一次 `pnpm install`，禁止在子项目内单独执行 npm/pnpm install。Rust 服务使用 Cargo，但由根目录脚本统一调用。

## 4. 分阶段执行计划

每一步都必须通过“完成门槛”后才能进入下一步。预计总周期为 4～6 周，按单人全职开发估算，不包含商店审核等待时间。

### 第 0 步：冻结范围和协议，0.5～1 天

目标：避免开发过程中再次在“Floccus 客户端”和“自有同步客户端”之间摇摆。

任务：

- 确认首期使用 Floccus WebDAV 适配器。
- 确认服务器只存储加密 XBEL 文件。
- 确认 Floccus passphrase 由用户自行保存，服务器不托管。
- 确认管理后台只管理账户、应用密码、文件元数据和部署状态。
- 确认侧边栏插件只操作浏览器原生书签。
- 确认首期不实现自有同步队列、CRDT 和自有 vaultKey。
- 固定首期支持 Chrome、Edge、Firefox 桌面版。

产出：

- 本执行计划。
- 架构图。
- MVP 验收清单。
- Floccus 配置操作说明初稿。

完成门槛：

- 所有模块都能明确回答“是否连接 WebDAV”。只有后端和 Floccus连接，侧边栏插件不连接。
- 所有模块都能明确回答“是否保存书签数据”。服务器保存密文文件，侧边栏不保存云端副本。

### 第 1 步：创建工程骨架，1～2 天

目标：建立可持续开发、测试和部署的 monorepo。

任务：

- 创建根目录 `package.json`。
- 更新根目录 `pnpm-workspace.yaml`。
- 创建 `apps/admin-web`。
- 创建 `apps/sidebar-extension`。
- 创建 `packages/protocol`。
- 创建 Rust `services/api`。
- 创建数据库 migration 目录。
- 创建 Docker Compose、Caddy 和环境变量模板。
- 配置 TypeScript strict、ESLint、Prettier、Vitest。
- 配置 Rustfmt、Clippy、Cargo test。
- 配置 GitHub Actions，但暂不推送 GitHub。

产出：

- 管理后台可以启动并显示健康页面。
- 侧边栏扩展可以在测试浏览器中加载。
- Rust API 可以启动并返回 `/health/live`。
- PostgreSQL 可以通过 Docker Compose 启动。

完成门槛：

```text
pnpm install       # 只在根目录执行
pnpm lint
pnpm test
cargo test
docker compose up
```

以上命令在干净环境中可以执行；一次性验证脚本放在 `tests/` 或临时目录，验证完成后删除。

### 第 2 步：账户、应用密码和文件存储，3～5 天

目标：先建立安全的服务端身份边界，再实现 WebDAV。

#### 数据表

```text
users
- id
- email_or_username
- password_hash
- status
- created_at
- updated_at

sessions
- id
- user_id
- token_hash
- expires_at
- revoked_at
- created_at

app_passwords
- id
- user_id
- name
- secret_hash
- last_used_at
- expires_at
- revoked_at
- created_at

dav_files
- id
- user_id
- path
- storage_key
- etag
- byte_size
- last_modified_at
- version
- created_at
- updated_at

file_versions
- id
- dav_file_id
- storage_key
- etag
- byte_size
- created_at

audit_logs
- id
- user_id
- action
- ip_hash_or_redacted_ip
- created_at
```

#### 后端接口

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/me

GET  /api/v1/app-passwords
POST /api/v1/app-passwords
DELETE /api/v1/app-passwords/{id}

GET  /api/v1/storage/status
GET  /api/v1/audit-logs
```

安全要求：

- 管理后台使用短期 Access Token 或 HttpOnly Secure Cookie。
- 账户密码使用 Argon2id 哈希。
- 应用密码只在创建时显示一次，数据库只保存哈希。
- WebDAV 使用应用密码，不允许使用账户主密码直接登录。
- 日志中不得记录账户密码、应用密码、Authorization 请求头和文件内容。
- 删除账户前要求二次确认。

存储策略：

- 单机 MVP 使用 Docker 持久卷保存加密文件。
- PostgreSQL 只保存文件元数据和版本信息。
- 通过 storage trait 抽象本地文件系统，后续可替换为 S3。
- 每次正式覆盖前保存一个历史版本，默认保留最近 10～30 个版本。

完成门槛：

- 可以注册、登录、退出。
- 可以创建和撤销应用密码。
- 撤销后的应用密码立即不能访问 WebDAV。
- 数据库中不存在应用密码明文。
- 用户无法访问其他用户的文件路径。

### 第 3 步：实现 WebDAV 兼容层，4～6 天

目标：让官方 Floccus 可以把服务当作 WebDAV 后端使用。

#### 路由

```text
/dav/{account}/bookmarks.xbel
/dav/{account}/bookmarks.xbel.temp
/dav/{account}/bookmarks.xbel.lock
```

#### 必须支持的方法

- `GET`：读取书签文件。
- `PUT`：写入正式文件、临时文件和锁文件。
- `DELETE`：删除临时文件和锁文件。
- `HEAD`：返回文件大小、ETag 和最后修改时间。
- `PROPFIND`：返回 Floccus 查询所需的文件属性。
- `MOVE`：将临时文件原子替换为正式文件。
- `OPTIONS`：返回允许的方法和 CORS 响应。

#### 文件锁

- 锁文件存在时拒绝其他客户端覆盖。
- 创建锁时使用数据库事务或 PostgreSQL advisory lock。
- 锁支持过期时间，避免浏览器崩溃后永久锁死。
- 冲突返回 `409 Conflict` 或 `423 Locked`。
- 删除不存在的锁返回 `404`，不能被视为严重错误。
- 正式文件写入采用临时文件 + `MOVE`，避免半文件。

#### 加密文件处理

- 服务端默认把文件当作 opaque blob，不解析书签内容。
- 生产模式要求启用 Floccus passphrase。
- 对明显的明文 XBEL/HTML 文件给出拒绝或明确告警。
- 不尝试在服务端实现 Floccus 加密算法。
- 保留原始 `Content-Length`、`ETag` 和 `Last-Modified`。

#### CORS 和扩展来源

- 正确处理 `OPTIONS` 预检。
- 允许 `Authorization`、`Content-Type` 等必要请求头。
- 使用 `Vary: Origin`。
- 不使用无条件的宽泛凭据跨域策略。
- 发布扩展后将 Chrome/Edge/Firefox 扩展来源加入允许列表；开发环境允许临时扩展来源。

完成门槛：

- 使用 curl 完成全部 WebDAV 方法测试。
- Floccus 可以读取空文件并上传加密 XBEL。
- Floccus 可以完成锁定、上传、MOVE、释放锁。
- 两个并发客户端不能同时覆盖同一个文件。
- 上传中断不会破坏上一个可用版本。

### 第 4 步：开发管理后台，4～6 天

目标：让普通用户不需要手动拼接 WebDAV 参数即可完成配置。

页面：

1. 登录页。
2. 注册页。
3. 控制台首页。
4. 应用密码页。
5. Floccus 配置向导。
6. 文件和存储状态页。
7. 账户安全页。
8. 账户删除页。

Floccus 配置向导显示：

- WebDAV 服务地址。
- 用户名。
- 应用密码。
- 推荐书签文件名 `bookmarks.xbel`。
- passphrase 必须由用户自行设置并妥善保存。
- Chrome、Edge、Firefox 的分步配置说明。

管理后台不显示书签树，因为服务器无法解密 Floccus 文件。可以显示：

- 文件大小。
- 最后同步时间。
- 文件版本数量。
- 最近访问设备或应用密码。
- 备份状态。

完成门槛：

- 用户可以从注册到拿到 Floccus 配置所需的全部信息。
- 应用密码只在创建成功页显示一次。
- 删除或撤销操作有明确确认和成功反馈。
- 移动端页面可以完成账户和应用密码管理。
- 管理后台端到端测试覆盖注册、登录、创建密码、撤销密码。

### 第 5 步：Floccus 三浏览器集成验收，3～5 天

目标：证明核心产品闭环真实可用。

测试环境：

- Chrome 最新稳定版。
- Edge 最新稳定版。
- Firefox 最新稳定版。
- 每个浏览器使用独立测试用户配置文件。
- 官方 Floccus 固定一个经过验证的版本。

测试流程：

1. 浏览器 A 创建测试文件夹和 20 个书签。
2. 使用 Floccus 加密上传。
3. 浏览器 B 下载并恢复。
4. 浏览器 C 修改标题、URL、文件夹和排序。
5. 观察 A、B 是否最终收敛。
6. 断开网络，在 B 中连续修改 50 条书签。
7. 恢复网络并验证不会丢失。
8. 同时在 A、B 中修改同一书签，验证锁和冲突行为。
9. 删除应用密码，确认所有 Floccus 请求失败。
10. 从文件历史版本恢复一次数据。

完成门槛：

- Chrome、Edge、Firefox 都能成功同步。
- 新增、修改、移动、删除和排序可收敛。
- 断网修改不会丢失。
- 服务端日志和存储中找不到书签标题、URL 和文件夹名称。
- Floccus 配置文档可以由新用户独立完成。

### 第 6 步：开发书签侧边栏插件，5～7 天

目标：提供类似“书签侧边栏”的操作体验，但不引入第二套同步系统。

#### 功能范围

- 展示书签树和文件夹。
- 展开、折叠和记忆当前目录。
- 本地关键词搜索。
- 新建书签和文件夹。
- 修改标题和 URL。
- 移动和删除节点。
- 拖拽排序。
- 添加当前页面。
- 新标签页打开。
- 复制 URL。
- 监听原生书签变更并刷新界面。

#### 浏览器实现

- Chrome/Edge 使用 `sidePanel`。
- Firefox 使用 `sidebar_action`。
- 使用 `chrome.bookmarks` 或 `browser.bookmarks`。
- 使用 `storage` 保存 UI 偏好，不保存云端书签副本。
- 使用 `tabs` 或 `activeTab` 获取当前页面标题和 URL。
- 不申请 `<all_urls>`。
- 不连接后端 WebDAV。

#### 与 Floccus 的协作规则

- 侧边栏所有写操作只调用浏览器书签 API。
- Floccus 负责将这些本地变化同步到服务器。
- 侧边栏不监听并上传自己的云端事件。
- 侧边栏不维护自己的 bookmark UUID 映射。
- 不在同一个浏览器中让侧边栏和未来自有同步引擎同时写入同一个远端库。

完成门槛：

- Chrome、Edge、Firefox 都能打开侧边栏。
- 书签读写、拖拽和搜索正常。
- 侧边栏修改后，Floccus 可以同步到第二个浏览器。
- 第二个浏览器的原生书签修改可以反映到侧边栏。
- 扩展不产生不必要的高风险权限警告。

### 第 7 步：安全、部署和发布，4～6 天

目标：将开发版本变成可以自部署和分发的版本。

后端加固：

- Caddy 自动 HTTPS。
- CORS 白名单。
- 登录限流和应用密码限流。
- 安全响应头。
- 请求体大小限制。
- WebDAV 文件大小限制。
- 超时锁清理。
- 非 root 容器运行。
- PostgreSQL 数据库备份。
- 加密文件历史版本清理。
- 删除账户和文件的恢复策略。

管理后台发布：

- 构建静态文件并由 Caddy 或独立静态容器提供。
- 编写隐私政策。
- 编写自部署安装文档。
- 编写应用密码和 passphrase 丢失说明。

侧边栏插件发布：

- Chrome Web Store。
- Microsoft Edge Add-ons。
- Firefox Add-ons。
- 准备图标、截图、商店描述和隐私政策。
- 说明 `bookmarks`、`tabs`、`storage` 权限用途。
- 禁止远程加载 JavaScript。
- 提交前构建生产包并检查 Manifest 权限。

完成门槛：

- 干净服务器可以按照文档完成部署。
- 数据库备份可以恢复。
- 浏览器插件生产包可以加载并通过三浏览器回归测试。
- 商店提交包不包含测试脚本、调试日志和开发地址。

## 5. API 和协议验收清单

### 5.1 管理 API

```text
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
GET    /api/v1/me

GET    /api/v1/app-passwords
POST   /api/v1/app-passwords
DELETE /api/v1/app-passwords/{id}

GET    /api/v1/storage/status
GET    /api/v1/audit-logs
```

### 5.2 WebDAV

```text
OPTIONS /dav/{account}/bookmarks.xbel
PROPFIND /dav/{account}/bookmarks.xbel
GET     /dav/{account}/bookmarks.xbel
HEAD    /dav/{account}/bookmarks.xbel
PUT     /dav/{account}/bookmarks.xbel.temp
MOVE    /dav/{account}/bookmarks.xbel.temp
PUT     /dav/{account}/bookmarks.xbel.lock
DELETE  /dav/{account}/bookmarks.xbel.lock
DELETE  /dav/{account}/bookmarks.xbel.temp
```

所有写入接口都必须：

- 校验认证。
- 校验用户路径归属。
- 校验文件大小。
- 记录必要审计信息，不记录文件内容。
- 支持幂等或安全重试。

## 6. 测试策略

### 6.1 后端单元测试

- 账户密码哈希和校验。
- 应用密码生成、哈希和撤销。
- 用户路径隔离。
- ETag 和版本号生成。
- 文件锁创建、续期、过期和释放。
- 临时文件 MOVE 原子替换。
- 文件大小限制。
- WebDAV 状态码。

### 6.2 后端集成测试

- PostgreSQL migration。
- 登录和令牌轮换。
- 应用密码鉴权 WebDAV。
- 两个用户互相隔离。
- 并发上传和锁冲突。
- 断电或请求中断后的临时文件清理。
- 历史版本和备份恢复。

### 6.3 前端测试

管理后台：

- 注册、登录、退出。
- 应用密码创建和撤销。
- 配置向导。
- 错误、过期会话和网络断开。

侧边栏插件：

- 书签树渲染。
- 搜索。
- 增删改移。
- 拖拽排序。
- 浏览器事件刷新。
- 当前页面收藏。

### 6.4 Floccus 黑盒测试

服务端不复制 Floccus 的同步实现，而是使用官方 Floccus进行黑盒验收。固定测试版本和测试配置，至少覆盖：

- 空文件首次同步。
- 加密文件上传和下载。
- 多浏览器同步。
- 离线同步。
- 锁文件。
- 临时文件。
- 文件恢复。
- 错误密码和撤销应用密码。

所有临时测试脚本在验证完成后删除，不进入正式产物。

## 7. 发布门槛

MVP 发布前必须满足：

1. 用户可以从管理后台注册并创建应用密码。
2. 官方 Floccus 可以连接 WebDAV 服务。
3. Floccus passphrase 加密文件可以跨 Chrome、Edge、Firefox 同步。
4. 服务端不保存书签明文。
5. 应用密码撤销即时生效。
6. 文件锁不会导致正常用户永久无法同步。
7. 上传中断不会破坏上一份有效文件。
8. 管理后台和侧边栏插件都有生产构建。
9. 侧边栏插件只访问必要浏览器权限。
10. Docker Compose 可以在干净 VPS 部署。
11. 数据库和加密文件可以完成恢复演练。
12. 官方市场提交包不包含一次性测试脚本和调试代码。

### 7.1 2026-08-25 封板审计状态

当前封板结论为 `NO-GO / NOT READY`。后端认证、WebDAV 协议、管理 API、扩展生产构建和自部署当前文件恢复已有验证证据；以下条件仍阻塞发布：

- 根目录缺少 `pnpm-workspace.yaml`，必须补齐统一依赖入口并在干净环境重新执行安装、测试和构建。
- Chrome、Edge、Firefox 和官方 Floccus 在当前环境不可用，FL-01～FL-05 真实同步验收保持 `BLOCKED`。
- 历史版本恢复与清理缺少 `file_versions` 快照、恢复 API/权限和清理机制，记录为 `GAP-002`，由独立任务处理。
- 管理后台/书签管理界面仍在收敛；浏览器点击级 E2E 尚未执行，账户删除按钮也未纳入通过项。
- 扩展商店仍需正式 Firefox ID、图标、截图、公开 HTTPS 隐私政策 URL、支持页和干净打包证据。

具体责任、顺序和命令见 [`docs/release-readiness.md`](docs/release-readiness.md)。在这些条件关闭并复验前，不得宣称 MVP 达到本节发布门槛。

## 8. 后续路线

只有当 Floccus + WebDAV + 侧边栏方案稳定后，才考虑以下功能：

1. 自有客户端加密协议。
2. Argon2id + vaultKey 密钥层级。
3. 自有扩展的离线事件队列。
4. 客户端冲突中心。
5. 标签、备注和全文索引。
6. 多人共享和集合密钥。
7. Web 管理后台本地解密并浏览书签。
8. 移动端原生客户端。

这些功能会引入新的客户端协议，必须作为独立版本设计，不能在首期 WebDAV 文件同步上直接叠加。

## 9. 开发过程约束

- 每完成一个阶段，先运行该阶段的验收测试，再进入下一阶段。
- 每次修改先在本地完成验证和提交；收到明确命令后再推送 GitHub。
- Node 依赖统一由根目录 pnpm workspace 管理。
- 不在子项目内单独执行 `npm install` 或 `pnpm install`。
- 不将账号密码、应用密码、passphrase、文件内容写入日志。
- 不使用一次性脚本污染正式源码或发布包。
- 不在没有数据备份和回滚方案时执行删除、迁移或批量覆盖。
