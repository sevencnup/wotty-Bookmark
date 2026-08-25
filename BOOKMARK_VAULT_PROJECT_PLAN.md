# Bookmark Vault：自部署浏览器书签同步项目计划

## 1. 项目概述

Bookmark Vault 是一个面向个人和小团队的自部署浏览器书签同步系统，产品体验参考 Bitwarden：

- 首期复用官方 Floccus 扩展读取、创建、修改和删除浏览器原生书签。
- 通过 WebDAV 将 Floccus 的书签文件同步到自部署服务器。
- 提供自己的 TypeScript 管理后台，用于注册、登录、应用密码、设备和服务状态管理。
- 自有浏览器扩展作为后续可选模块，用于获得更强的加密、搜索和冲突处理能力。
- 服务器默认无法解密用户的书签内容。
- 首期聚焦“个人多浏览器、多设备同步”，暂不实现多人协同编辑。

这里的“共享”指同一账号在多个浏览器之间共享书签；多人账号共享属于后续版本。

## 2. 产品边界

### 2.1 首期必须实现

1. 实现兼容 Floccus 的 WebDAV 服务。
2. 官方 Floccus 在 Chrome、Edge、Firefox 上可以连接和自动同步。
3. 支持 XBEL 文件、临时文件、锁文件和原子替换。
4. 支持账户注册、登录、应用密码、设备和服务状态管理。
5. 支持 Floccus 客户端 passphrase 加密，服务器只保存密文文件。
6. 提供 TypeScript 管理后台，不在后台展示无法解密的书签明文。
7. Docker Compose 自部署，包含数据库迁移、健康检查和备份方案。
8. 为后续自有浏览器扩展预留原生加密同步 API。

### 2.2 首期明确不做

- 不替换浏览器的 `chrome://bookmarks` 原生页面。
- 不接管浏览器内部的书签栏、快捷键或浏览器菜单。
- 不实现多人实时协同编辑。
- 不做服务端明文搜索。
- 不抓取网页正文、截图或浏览历史。
- 不在服务端保存用户主密码或书签明文。
- 不默认修改浏览器自带的同步设置。

## 3. 总体技术选型

### 3.1 前端和客户端

首期有两个客户端概念：

1. 官方 Floccus：负责浏览器书签读取、书签树操作、同步和冲突处理；它不是本项目代码，也不需要我们发布插件。
2. Bookmark Vault 管理后台：负责账户、应用密码、设备、服务状态和部署配置；这是本项目需要开发和部署的前端。

管理后台使用：

- TypeScript：业务代码和类型系统。
- React + Vite：管理后台。
- Tailwind CSS：管理后台样式。
- Zustand：轻量本地 UI 状态管理。
- TanStack Query：服务端同步状态、请求缓存和重试。
- Zod：API 响应和本地数据校验。
- Vitest：单元测试。
- Playwright：端到端测试。

管理后台页面：

- 注册和登录。
- 应用密码创建、撤销和复制。
- 设备列表和远程注销。
- WebDAV 地址、账户状态、存储空间和最近活动。
- Floccus 配置说明和加密口令提醒。

侧边栏伴侣插件使用 WXT、Manifest V3、Side Panel、Popup 和浏览器原生书签 API。它只操作本地浏览器书签，不保存第二份云端书签，也不实现自己的同步协议；Floccus 监听这些本地变化并负责同步。

更强的客户端加密扩展、独立同步引擎、Dexie 和 IndexedDB 属于后续可选版本，不是侧边栏伴侣插件的必需品。

侧边栏数据流：

```text
侧边栏插件
      ↕ chrome.bookmarks / browser.bookmarks
浏览器原生书签
      ↕ Floccus
WebDAV 自部署服务
```

侧边栏伴侣插件功能：

- 书签树和文件夹展开。
- 关键词搜索。
- 新建、编辑、移动、删除书签。
- 拖拽排序。
- 当前页面快速收藏。
- 新标签页打开、复制 URL 和右键操作。
- 同步状态提示交给 Floccus显示，插件自身不上传云端。

### 3.2 后端

后端选用 Rust 生态，而不是 Node.js，原因是同步服务本身不需要复杂的服务端渲染，Rust 在并发、内存安全、低资源部署和安全边界方面更合适。

- Rust stable：后端主语言。
- Axum：HTTP API 和 WebSocket 服务。
- Tokio：异步运行时。
- SQLx：PostgreSQL 访问和编译期 SQL 检查。
- PostgreSQL 16：账户、应用密码、文件元数据和审计元数据；原生加密同步事件属于后续扩展能力。
- Redis：限流、短期会话状态和可选的多实例通知；单机部署可以先不启用。
- `utoipa`：OpenAPI 文档生成。
- `tracing` + `tracing-subscriber`：结构化日志。
- `thiserror` / `anyhow`：错误处理。
- `argon2`：服务端账户凭证保护和管理员密码保护。
- WebAuthn：后续可选的无密码登录和设备确认。

认证设计建议使用 OPAQUE/PAKE 类协议，使服务器在登录过程中也不需要直接接触用户主密码。若第一阶段缺少成熟、稳定的浏览器端 OPAQUE 实现，则先采用 TLS + 客户端派生认证验证值 + 服务端 Argon2id 存储，后续无损升级认证协议。

### 3.3 部署

- Docker Compose：个人和小团队的首选部署方式。
- Caddy：自动 HTTPS、反向代理和安全响应头。
- PostgreSQL：持久化主库。
- Redis：可选服务。
- S3 兼容对象存储：可选，用于加密快照和大文件备份。
- GitHub Actions：测试、构建镜像和发布。
- Prometheus + Grafana：后续可选，不作为 MVP 必选依赖。

## 4. 安全模型

### 4.1 加密目标

服务器可以知道：

- 账户存在。
- 设备数量和在线时间。
- 加密数据大小、版本号和同步时间。
- 请求来源 IP 和基础运行日志。

服务器不应知道：

- 书签标题。
- 书签 URL。
- 文件夹名称和层级。
- 标签、备注和本地搜索词。

### 4.2 密钥层级

推荐采用以下结构：

```text
主密码
  ↓ Argon2id / PAKE
主密钥派生材料
  ↓ HKDF，不同用途使用不同 label
├── 书签库密钥 Vault Key
├── 本地数据库保护密钥
└── 登录认证密钥或认证证明
```

具体方案：

1. 客户端生成高熵随机 `vaultKey`。
2. 使用 Argon2id 从主密码派生 `passwordKey`。
3. 使用 HKDF 为 `vaultKey` 生成包装密钥。
4. 将包装后的 `vaultKey` 和 KDF 参数上传服务器。
5. 每条书签记录或同步操作使用随机 nonce 加密。
6. 使用 AEAD 算法校验密文完整性。

首选：XChaCha20-Poly1305；浏览器原生实现不完整时使用经过验证的 libsodium WASM。也可以使用 Web Crypto API 的 AES-256-GCM，但必须统一 nonce、AAD 和密钥轮换规则。

不要自行实现密码学算法。密码、派生密钥、解锁后的 vaultKey 仅在需要时保存在内存中，扩展锁定后清理引用并关闭本地明文缓存。

### 4.3 恢复和丢失密码

主密码丢失时，服务器不能解密书签。产品必须提供：

- 一次性恢复密钥。
- 加密书签库导出。
- 设备列表和远程撤销。
- 修改主密码时重新包装 vaultKey，而不是重新加密全部书签。

恢复密钥本身必须只展示一次，并要求用户确认已保存。

## 5. 扩展能力和浏览器适配（后续自有扩展）

本章不属于 Floccus WebDAV MVP。首期由官方 Floccus 负责浏览器 API 适配；只有开发 Bookmark Vault 自有扩展时，才实现以下适配器。

### 5.1 必要权限

首期尽量只申请必要权限：

- `bookmarks`：读取和修改书签。
- `storage`：保存非敏感扩展设置。
- `alarms`：定时同步。
- `contextMenus`：右键添加书签。
- `tabs` 或 `activeTab`：获取当前页面标题和 URL。

不默认申请 `<all_urls>`，因为书签同步不需要访问网页内容。若后续增加网页内快捷收藏，再单独设计权限说明。

### 5.2 书签适配器

封装统一接口，避免业务代码直接依赖某个浏览器：

```ts
interface BrowserBookmarkAdapter {
  getTree(): Promise<BrowserBookmarkNode[]>;
  create(input: CreateBookmarkInput): Promise<BrowserBookmarkNode>;
  update(id: string, patch: UpdateBookmarkInput): Promise<void>;
  move(id: string, parentId: string, index?: number): Promise<void>;
  remove(id: string): Promise<void>;
  onCreated(listener: ChangeListener): Unsubscribe;
  onChanged(listener: ChangeListener): Unsubscribe;
  onMoved(listener: ChangeListener): Unsubscribe;
  onRemoved(listener: ChangeListener): Unsubscribe;
}
```

Chrome、Edge、Firefox 只在适配器层处理 API 差异。浏览器原生 ID 只用于本地映射，不上传作为云端主键。

### 5.3 原生书签和云端书签的关系

云端使用独立 UUID：

```text
Cloud Bookmark UUID ←→ Browser-specific Bookmark ID
```

本地保存映射表，并记录浏览器实例 ID。这样同一个云端书签可以在不同浏览器生成不同的本地节点，同时避免重复创建。

浏览器事件可能由扩展自己的写入触发，因此必须实现：

- 写入操作去重。
- 事件防回环。
- 批量操作事务队列。
- 本地 ID 映射失效后的重新关联。
- 浏览器原生根目录保护。

## 6. 云端数据模型（后续自有扩展）

Floccus MVP 只需要保存账户、应用密码、WebDAV 文件元数据和加密 XBEL 文件。下面的 vault 与同步事件模型用于后续自有扩展，不是 WebDAV MVP 的必需实现。

服务端不保存书签明文，核心数据建议如下。

### 6.1 账户和设备

```text
users
- id
- login_identifier
- auth_verifier
- status
- created_at
- updated_at

devices
- id
- user_id
- encrypted_device_name
- last_sync_cursor
- last_seen_at
- revoked_at
```

设备名称可加密。登录标识和账户状态可以明文保存。

### 6.2 书签库

```text
vaults
- id
- user_id
- encrypted_vault_key
- kdf_type
- kdf_params
- schema_version
- revision
- created_at
- updated_at
```

### 6.3 同步事件

```text
sync_operations
- id
- vault_id
- device_id
- client_operation_id
- server_sequence
- encrypted_payload
- nonce
- aad
- created_at
- expires_at
```

`client_operation_id` 必须唯一，用于网络重试去重。`server_sequence` 是服务端为同步游标分配的单调序号。

同步事件的密文内容由客户端定义，例如：

```ts
type BookmarkOperation =
  | { type: "create"; item: BookmarkItem }
  | { type: "update"; itemId: string; patch: BookmarkPatch }
  | { type: "move"; itemId: string; parentId: string; position: Position }
  | { type: "delete"; itemId: string; deletedAt: number }
  | { type: "snapshot"; items: BookmarkItem[] };
```

服务端只负责鉴权、去重、排序、保存、分页返回密文，不参与书签业务合并。

## 7. 同步方案（后续自有扩展）

Floccus MVP 的同步、离线队列和冲突策略由 Floccus 客户端负责；本章描述的是未来 Bookmark Vault 自有扩展的事件同步方案。

### 7.1 首次登录

必须避免自动覆盖用户现有书签。流程为：

1. 读取当前浏览器书签树。
2. 下载云端快照和增量事件。
3. 展示本地节点数、云端节点数和预计冲突数。
4. 用户选择“上传本地”“下载云端”或“智能合并”。
5. 执行前创建本地快照，支持撤销。
6. 完成后建立云端 UUID 与浏览器 ID 映射。

### 7.2 常规同步

1. 浏览器事件进入本地队列。
2. 对连续输入进行 300～800 毫秒防抖。
3. 客户端生成操作 ID、设备时钟和操作内容。
4. 使用 vaultKey 加密后上传。
5. 服务端检查账户、设备和操作 ID，写入事件日志。
6. 客户端使用游标拉取其他设备事件。
7. 解密并应用事件。
8. 将结果写入浏览器原生书签。
9. 标记本地事件已确认。

首期使用“事件日志 + 客户端合并”，不直接上 CRDT。个人多设备场景下，这种实现更容易调试、备份和迁移。多人实时共享或复杂离线协作时，再评估 Automerge/Yjs 等加密 CRDT。

### 7.3 冲突策略

首期采用可预测的策略：

- 同一书签的标题、URL、备注等字段：基于操作版本进行最后写入优先。
- 同一书签同时被移动：采用最后确认的移动，并保留冲突记录。
- 一端删除、一端修改：删除优先，但保留 30 天软删除，可从冲突中心恢复。
- 同一位置排序冲突：使用稳定排序键和 server sequence，确保所有设备最终一致。
- 服务端永远不静默丢弃未确认的客户端事件。

后续可以增加冲突副本和手工解决页面。

### 7.4 失败和恢复

- 所有上传请求支持幂等重试。
- 网络断开时继续写入本地队列。
- 服务端返回 401 时刷新令牌，不重复提交已确认操作。
- 游标过期时下载最新加密快照，再重放快照后的事件。
- 数据库恢复后通过快照和事件日志重建同步状态。
- 删除使用 tombstone，避免离线设备重新创建已删除节点。

## 8. 原生 API 设计（后续自有扩展和管理后台）

首期管理后台使用账户和应用密码接口，Floccus 书签同步使用第 9 章的 WebDAV 协议；本章的加密 vault 和事件接口在开发自有扩展时启用。

API 前缀统一为 `/api/v1`。

### 8.1 认证

```text
POST /auth/register
POST /auth/login/start
POST /auth/login/finish
POST /auth/refresh
POST /auth/logout
GET  /auth/me
GET  /devices
POST /devices/{deviceId}/revoke
```

### 8.2 书签库和同步

```text
GET  /vault
PUT  /vault/key
GET  /sync/pull?cursor=<cursor>&limit=500
POST /sync/push
POST /sync/ack
GET  /sync/status
POST /vault/export
```

`/sync/push` 接收一批密文操作并返回已接受的操作 ID和服务端游标。`/sync/pull` 只返回密文事件和必要的同步元数据。

### 8.3 API 原则

- 所有写接口要求幂等 ID。
- 所有接口使用 HTTPS。
- Access Token 短时有效，Refresh Token 轮换并可撤销。
- 使用统一错误码，避免把数据库错误直接返回客户端。
- 使用 OpenAPI 生成客户端类型或手动维护共享协议包。
- 服务端日志禁止记录请求体、URL 参数中的密文以外敏感信息和认证凭证。

## 9. Floccus 兼容方案

### 9.1 结论

可以使用 Floccus 自动同步，但不能让 Floccus 直接调用 Bookmark Vault 自定义的 `/api/v1/sync` 接口。Floccus 使用内置的后端适配器，服务端必须实现它支持的协议之一。

首选 WebDAV 兼容层，原因是协议简单、部署成熟、Floccus 已原生支持，并且不需要维护 Floccus 分支。

推荐的服务结构：

```text
Floccus
   ↓ WebDAV + XBEL
Bookmark Vault WebDAV Adapter
   ↓
账户认证 / 文件锁 / 加密文件存储
```

后续如果开发自己的 Bookmark Vault 扩展，再使用原计划中的加密事件 API：

```text
Floccus ───────────→ /dav/{account}/bookmarks.xbel
Bookmark Vault 扩展 ─→ /api/v1/sync
```

两个入口可以共用账户、设备管理、备份和审计系统，但不应直接混用两套同步事件格式。

### 9.2 WebDAV 兼容接口

Rust 服务需要实现 Floccus WebDAV 适配器实际使用到的操作：

- `GET`：读取 `bookmarks.xbel` 或 HTML 书签文件。
- `PUT`：上传临时文件、正式书签文件和锁文件。
- `DELETE`：删除临时文件和锁文件。
- `HEAD`：返回文件大小、修改时间和缓存相关信息。
- `PROPFIND`：让 Floccus 查询远程文件属性和大小。
- `MOVE`：支持“临时文件上传后原子替换正式文件”。
- `OPTIONS`：返回允许的方法和必要的 CORS 信息。

默认文件路径：

```text
/dav/{user-or-vault}/bookmarks.xbel
/dav/{user-or-vault}/bookmarks.xbel.temp
/dav/{user-or-vault}/bookmarks.xbel.lock
```

服务端还需要满足以下行为：

- `bookmarks.xbel.lock` 存在时返回锁定状态。
- 创建锁文件时支持 `409 Conflict` 或 `423 Locked`。
- 正常删除锁文件返回 `200`、`204` 或文件不存在时返回 `404`。
- 文件上传完成后返回正确的 `Content-Length`、`Last-Modified` 和 `ETag`。
- 临时文件替换正式文件必须尽量原子化。
- 支持 Basic Auth；生产环境使用随机应用密码，不建议把主密码直接作为 WebDAV 密码。
- 浏览器扩展请求需要正确的 `Access-Control-Allow-Origin`、`Access-Control-Allow-Headers` 和 `Access-Control-Allow-Methods`。

### 9.3 Floccus 的加密边界

Floccus WebDAV 配置本身支持使用 passphrase 在客户端加密整个书签文件。启用后，服务器看到的是加密后的文件，符合“服务器不读取书签明文”的目标。

但这套加密格式和 Bookmark Vault 原计划的 Argon2id + vaultKey + 加密事件模型不是同一套协议。当前 Floccus 的 WebDAV 加密是单个 XBEL 文件整体加密，客户端负责加密和解密。因此：

- 使用官方 Floccus：采用 Floccus 自己的 passphrase 加密格式。
- 使用 Bookmark Vault 自有扩展：采用 Bookmark Vault 的加密事件 API。
- 两者需要共享数据时，必须由服务端或客户端增加 XBEL 与内部书签模型的转换层，不能直接把一套密文当成另一套密文解析。

这意味着 Floccus 兼容模式的主密码和 Bookmark Vault 自有扩展的主密码最好明确区分，或者在产品设计阶段统一密钥协议。首期建议使用独立的 Floccus 加密口令，避免错误地宣称两种加密格式可以互相解密。

### 9.4 兼容模式的优点和限制

优点：

- 用户可以直接安装官方 Floccus，不需要安装我们的扩展。
- Chrome、Edge、Firefox 和 Floccus 移动端生态可以复用。
- 不需要开发浏览器书签事件监听、合并和重试逻辑。
- WebDAV 可被其他同步客户端和文件工具复用。

限制：

- Floccus 以一个 XBEL/HTML 文件为主要同步单元，通常是全量文件上传，不是我们的逐条事件同步。
- 服务端不能提供 Bookmark Vault 专属的标签、备注、全文索引和高级冲突界面。
- Floccus 的登录配置是服务器地址、用户名、密码/应用密码和 passphrase，不是我们的自定义登录页面。
- 如果需要 Argon2id、设备密钥、恢复密钥和更细粒度的加密事件同步，仍然需要自己的扩展。
- Floccus 的同步策略和冲突逻辑由 Floccus 客户端决定，服务端只能提供文件和锁能力。

### 9.5 不建议优先仿造 Nextcloud Bookmarks API

仿造 Nextcloud Bookmarks API 也能让 Floccus 选择“Nextcloud Bookmarks”后端，但需要实现用户、文件夹、书签、标签、分页、锁定和多个资源接口，兼容成本明显高于 WebDAV。

此外，Nextcloud Bookmarks 适配器默认按 JSON 书签资源访问服务端，若不额外改造客户端，服务端可能看到书签标题和 URL，这与本项目的端到端加密目标不一致。因此它只作为后续兼容选项，不作为首期协议。

## 10. 推荐目录结构

```text
/code/bookmark-vault/
├── package.json
├── pnpm-workspace.yaml
├── apps/
│   ├── admin-web/              # React + Vite + TypeScript，首期必需
│   └── extension/              # WXT + React + TypeScript，后续可选
├── packages/
│   ├── protocol/               # Zod schema、管理 API 类型、错误码
│   ├── crypto/                 # 后续自有扩展的客户端加密封装
│   ├── sync-engine/            # 后续自有扩展的本地同步引擎
│   └── test-fixtures/          # 固定测试数据和加密测试向量
├── services/
│   └── api/                    # Rust + Axum + SQLx
│       ├── src/webdav/         # Floccus WebDAV/XBEL 兼容层
│       └── src/api/             # 账户、应用密码和管理 API
├── migrations/                 # PostgreSQL migrations
├── infra/
│   ├── docker-compose.yml
│   ├── Caddyfile
│   └── backup/
├── docs/
│   ├── architecture.md
│   ├── security-model.md
│   └── api/openapi.yaml
└── tests/
    ├── e2e/
    └── sync-convergence/
```

TypeScript 子项目统一纳入根目录 pnpm workspace。创建项目后只在根目录执行一次 `pnpm install`；不要在子项目内单独执行 npm/pnpm install。Rust API 使用 Cargo 管理自身依赖，但由根目录脚本统一调用。

## 11. 开发阶段和交付物

### 阶段 0：技术验证，1 周

目标：验证最大风险，而不是先做界面。

- 官方 Floccus 通过 WebDAV 连接服务。
- 完成 `GET`、`PUT`、`DELETE`、`PROPFIND`、`MOVE` 和锁文件测试。
- Floccus passphrase 加密后的 XBEL 文件可以正确上传和下载。
- 两个浏览器实例完成一次自动同步和一次离线后收敛测试。
- 验证服务端数据库和文件存储中不存在书签明文。

交付物：WebDAV 技术验证服务、Floccus 配置说明、协议测试用例和风险清单。

### 阶段 1：工程骨架，1 周

- 建立 pnpm workspace。
- 创建管理后台、共享协议包和 Rust API。
- 配置 ESLint、Prettier、TypeScript strict、Clippy、Rustfmt。
- 配置 GitHub Actions。
- 创建 PostgreSQL migration 和 Docker Compose。
- 定义错误码、API 版本和日志规范。
- 预留 `/dav` WebDAV 路由和 `/api/v1` 原生 API 路由。

交付物：可启动的本地开发环境和 CI 基线。

### 阶段 1.5：Floccus WebDAV MVP，1～2 周

- 实现账户到 WebDAV 路径的映射。
- 实现 XBEL 文件读写。
- 实现临时文件、锁文件和原子替换。
- 支持 Basic Auth 应用密码。
- 支持 Floccus 的 passphrase 加密文件格式透传。
- 使用官方 Floccus 完成 Chrome、Firefox 双端测试。

交付物：用户无需安装 Bookmark Vault 自有扩展，即可使用官方 Floccus 连接自部署服务并自动同步书签。

### 阶段 1.6：管理后台，1～2 周

- React + TypeScript 管理后台。
- 注册、登录和退出。
- 应用密码创建、复制、撤销和权限说明。
- WebDAV 地址和 Floccus 配置向导。
- 设备列表、最近活动和账户删除。
- 存储空间、文件版本和备份状态展示。

交付物：用户可以通过网页完成账户管理，并根据向导配置官方 Floccus。

### 阶段 2：Floccus MVP 发布，1 周

- 完成 Docker Compose 自部署。
- 完成 PostgreSQL 备份和恢复。
- 完成 HTTPS、限流、CORS 和安全响应头。
- 完成 Chrome、Edge、Firefox 的 Floccus 使用文档。
- 完成跨浏览器自动同步验收。

交付物：不发布自有浏览器扩展即可使用的首个正式版本。

### 阶段 2.5：侧边栏伴侣插件，2～3 周

- WXT + React + TypeScript。
- Chrome/Edge 使用 Side Panel API。
- Firefox 使用 `sidebar_action`。
- 申请 `bookmarks`、`storage`、`tabs` 或 `activeTab` 等最小权限。
- 读取并展示浏览器原生书签树。
- 通过浏览器书签 API 执行新增、修改、移动和删除。
- 不连接 WebDAV，不保存云端副本，不实现第二套同步队列。
- 在 Chrome、Edge、Firefox 中测试与 Floccus同时运行时的事件一致性。
- 准备隐私政策、权限说明、截图和官方商店发布包。

交付物：类似“书签侧边栏”的独立浏览器插件；用户安装 Floccus负责同步，再安装本插件获得更好的侧边栏书签体验。

### 阶段 3：自有扩展，可选，4～6 周

- WXT + React + TypeScript 浏览器扩展。
- Chrome/Edge `chrome.bookmarks` 适配器。
- Firefox `browser.bookmarks` 适配器。
- 本地加密保险库和 Argon2id 密钥派生。
- 原生加密事件 API、离线队列和冲突中心。
- 扩展商店资料、隐私政策和权限说明。

交付物：可选的 Bookmark Vault 官方浏览器扩展；该扩展与 Floccus WebDAV 客户端是两种不同客户端，不应在同一浏览器配置中同时写入同一个书签库。

### 阶段 3.1：自有扩展同步引擎，可选，2～3 周

- 本地操作日志。
- 加密上传和分页拉取。
- 游标、幂等、重试和软删除。
- 离线队列。
- 初次上传、下载、合并流程。
- 冲突检测和基础冲突中心。
- 断网、重启、重复事件和服务端恢复测试。

交付物：多个浏览器最终一致的个人书签同步。

### 阶段 3.2：自有扩展产品界面，可选，1～2 周

- Side Panel 书签树。
- 快速搜索和打开。
- 添加当前页面。
- 右键菜单。
- 同步状态、最近同步时间和失败重试。
- 设置、设备管理、锁定和恢复密钥页面。

交付物：可供真实用户使用的扩展 MVP。

### 阶段 4：发布和加固，1～2 周

- Playwright 跨浏览器测试。
- 同步收敛压力测试。
- 依赖漏洞扫描。
- CSP、CORS、CSRF、限流和安全响应头检查。
- 数据库备份恢复演练。
- Docker 镜像瘦身和非 root 运行。
- 安装、升级、迁移和故障排查文档。

交付物：可自部署的首个稳定版本。

## 12. 测试要求

### 12.1 单元测试

- URL、标题和文件夹规范化。
- 书签树增删改移动。
- 浏览器 ID 映射。
- 操作日志重放。
- 事件去重。
- 冲突合并。
- 加密、解密、错误 nonce、篡改检测。
- 主密码错误和锁定行为。

### 12.2 集成测试

- API 鉴权和令牌轮换。
- PostgreSQL migration。
- 操作幂等性。
- 游标分页。
- 并发上传。
- 设备撤销后的访问控制。

### 12.3 端到端测试

- 浏览器 A 创建书签，浏览器 B 自动出现。
- 浏览器 B 离线修改，重新联网后浏览器 A 收敛。
- 同一书签发生冲突并可恢复。
- 删除后离线设备不会重新创建节点。
- 扩展重启、浏览器重启和服务器重启后数据不丢失。
- 服务端数据库中不存在书签明文。
- 官方 Floccus 可以通过 WebDAV profile 完成上传、下载、锁定、解锁和自动同步。

测试用的一次性脚本必须放在临时目录或测试目录，并在验证完成后删除，不进入正式发布产物。

## 13. 性能目标

Floccus WebDAV MVP 目标：

- 支持至少 10 MB 的加密 XBEL 文件。
- 单个账户文件读写 P95 小于 2 秒（不含 Floccus 客户端处理时间）。
- API 在 2 核 4 GB VPS 上支持 100 个并发在线账户。
- 文件锁创建、续期和释放不会产生并发覆盖。
- 数据库和文件备份支持完整恢复。

自有扩展后续目标：

- 单个账户支持至少 100,000 个书签节点。
- 客户端搜索 100,000 个节点保持可用，索引在本地完成。

## 14. 部署方案

最小部署：

```text
Caddy → Rust API → PostgreSQL
                  └→ Redis（可选）
```

生产要求：

- API、数据库、Redis 使用独立容器网络。
- PostgreSQL 每日全量备份、每小时增量或 WAL 归档。
- 备份文件单独加密并定期执行恢复演练。
- 所有密钥通过环境变量或 Docker secrets 注入。
- API 使用非 root 用户运行。
- 数据库只对内部网络开放。
- 提供 `/health/live` 和 `/health/ready`。
- 提供数据保留、删除账户和导出账户数据接口。

## 15. 主要风险和应对

| 风险 | 影响 | 应对 |
|---|---|---|
| 浏览器书签事件反复触发 | 产生同步回环 | 操作来源标记、幂等 ID、事件抑制窗口 |
| 首次导入覆盖用户书签 | 数据丢失 | 强制选择同步方向、先创建快照 |
| 主密码丢失 | 无法解密数据 | 恢复密钥和加密导出 |
| 不同浏览器 ID 不同 | 重复书签 | 云端 UUID + 本地映射 |
| 多设备同时修改 | 数据冲突 | 版本检测、冲突记录、可恢复删除 |
| 浏览器 API 差异 | 跨浏览器异常 | 适配器层和跨浏览器 E2E 测试 |
| 书签包含恶意 URL | 点击后产生安全问题 | 对 `javascript:` 等危险协议明确拦截或警告 |
| 加密依赖不成熟 | 数据不可恢复 | 固定版本、测试向量、密钥版本和迁移机制 |
| 服务端事件无限增长 | 存储膨胀 | 加密快照、事件压缩和安全保留周期 |
| Floccus 与原生 API 数据格式不同 | 两套客户端无法直接互解 | 明确协议边界，增加 XBEL/内部模型转换和独立测试 |

## 16. MVP 验收标准

MVP 只有在以下条件全部满足时才发布：

1. 用户可以从官方市场安装 Floccus 并完成 WebDAV 配置。
2. Floccus 首次同步不会因服务端覆盖策略导致书签意外丢失。
3. 两个浏览器的新增、修改、移动和删除可以最终一致。
4. 断网期间的修改在恢复网络后不会丢失。
5. 重复上传不会产生损坏文件或并发覆盖。
6. Floccus 的文件锁和冲突处理流程可以正常工作。
7. 账户密码、应用密码和 Floccus passphrase 不以明文写入日志或数据库。
8. 服务端数据库中无法直接搜索出书签标题和 URL。
9. 用户可以撤销某个应用密码。
10. 可以执行加密文件导出、数据库备份和完整恢复演练。
11. 根目录 pnpm workspace、CI、Docker Compose 和部署文档可在干净环境运行。
12. 官方 Floccus 可以使用 WebDAV 配置连接服务，并在两个浏览器之间自动同步。

## 17. 推荐的实施顺序

第一优先级建议调整为先完成“Floccus → WebDAV → XBEL 文件 → 另一浏览器自动恢复”的兼容闭环。这样可以快速得到可用的自部署同步服务。

后续如果确实需要标签、备注、全文搜索、设备密钥和高级冲突界面，再完成“书签事件 → 加密操作 → 服务端保存 → 另一浏览器解密并恢复”的 Bookmark Vault 原生扩展闭环。

最终产品定位可以概括为：

> WebDAV 书签同步服务 + TypeScript 管理后台 + 可选的客户端加密浏览器扩展。
