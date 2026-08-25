# Floccus 三浏览器集成验收

## 1. 目标和范围

本 runbook 验证 Bookmark Vault 的首期闭环：管理后台创建应用密码，官方 Floccus 通过 WebDAV 保存加密 XBEL，Chrome、Edge、Firefox 的原生书签最终收敛，Bookmark Vault 侧边栏只操作浏览器原生书签。

服务端协议烟测见 [`tests/webdav/README.md`](../tests/webdav/README.md)。本文件不实现自有同步协议，也不把 Floccus 的 passphrase 上传到服务器。

## 2. 验收前置条件

- 使用经过验证的 API 镜像或本地源码构建，并记录 API、PostgreSQL、Floccus 和浏览器版本。
- 使用独立的 Chrome、Edge、Firefox 测试配置文件，不使用个人书签配置文件。
- 使用独立测试账户和每个设备独立的 WebDAV 应用密码。
- 在 Compose 或反向代理中配置精确的 `CORS_ALLOWED_ORIGINS`，禁止使用 `*`；记录实际 Floccus 扩展来源。
- 服务地址使用 HTTPS；仅本地 smoke test 可以使用 `http://127.0.0.1:8080`。
- Floccus WebDAV 地址使用 `/dav/<用户名>/`，文件名使用 `bookmarks.xbel`；若 Floccus 版本要求完整路径，则使用 `/dav/<用户名>/bookmarks.xbel`。
- 为 Floccus 设置只在客户端保存的测试 passphrase；不要把它写入 issue、日志、截图或 Git。
- 每个浏览器、Floccus 版本和测试结果都写入证据表。

## 3. 结果定义

| 标记 | 含义 |
| --- | --- |
| `PASS` | 实际结果符合预期，并留有最小证据 |
| `FAIL` | 实际结果与预期不符，必须记录复现步骤和影响 |
| `BLOCKED` | 缺少浏览器、Floccus、部署能力或前置修复，不能冒充通过 |
| `N/A` | 该平台不适用，必须写明原因 |

## 4. 浏览器矩阵

| 浏览器 | 版本 | 测试配置文件 | Floccus 版本 | 侧边栏构建 | 结果 |
| --- | --- | --- | --- | --- | --- |
| Chrome Stable | 待填写 | `bookmark-vault-qa-chrome` | 待填写 | Chrome MV3 | `BLOCKED`（当前环境未安装） |
| Edge Stable | 待填写 | `bookmark-vault-qa-edge` | 待填写 | Chrome/Edge MV3 | `BLOCKED`（当前环境未安装） |
| Firefox Stable | 待填写 | `bookmark-vault-qa-firefox` | 待填写 | Firefox MV2 `sidebar_action` | `BLOCKED`（当前环境未安装） |

侧边栏生产构建命令：

```bash
pnpm --filter @bookmark-vault/sidebar-extension build
pnpm --filter @bookmark-vault/sidebar-extension build:firefox
```

## 5. 测试流程

### FL-01：首次配置和加密上传

1. 在管理后台注册测试账户并创建应用密码。
2. 在 Floccus 中选择 WebDAV，填写地址、用户名、应用密码和 `bookmarks.xbel`。
3. 开启客户端加密并设置测试 passphrase。
4. 在 Chrome 测试配置文件中创建 `QA Root/Initial` 文件夹和 20 个书签，至少包含一个带特殊字符的标题和 URL。
5. 手动触发同步，确认服务端返回成功。
6. 记录文件大小、ETag、最后修改时间，不记录书签内容。

预期：Floccus 完成锁定、临时上传、MOVE、释放锁；服务端只看到加密 XBEL opaque blob。

### FL-02：三浏览器下载和收敛

1. 在 Edge 测试配置文件使用相同 WebDAV 文件和相同 passphrase。
2. 在 Firefox 测试配置文件重复配置并执行首次同步。
3. 验证三端都出现 `QA Root/Initial` 及 20 个书签。
4. 分别在三端执行新增、修改标题、修改 URL、移动文件夹、删除和排序。
5. 逐端手动同步，等待所有端完成后再次检查树结构。

预期：新增、修改、移动、删除和排序最终收敛，不出现半文件、重复根节点或永久锁。

### FL-03：侧边栏本地写入与 Floccus 同步

1. 在 Chrome、Edge、Firefox 分别加载对应生产构建。
2. 从侧边栏搜索、打开和复制已有书签。
3. 从侧边栏新增书签和文件夹，编辑标题/URL，移动和删除节点。
4. 检查浏览器原生书签管理器能看到相同变化。
5. 运行 Floccus，同步到另外两个浏览器。

预期：侧边栏只调用浏览器书签 API；它不请求 `/dav/`，不保存第二份云端书签，不申请 `<all_urls>`。

### FL-04：离线修改和并发锁

1. 断开 Edge 网络，在 Edge 连续修改 50 条书签。
2. 在 Chrome 在线修改不同的 10 条书签并完成同步。
3. 恢复 Edge 网络并触发同步，记录 Floccus 的冲突处理结果。
4. 在 A、B 两端同时修改同一书签，观察锁冲突、重试和最终提示。

预期：不同节点修改不被静默丢弃；同一文件不会被两个客户端同时覆盖；临时上传失败不破坏上一份有效文件。

### FL-05：应用密码撤销

1. 用当前 Floccus 应用密码完成一次成功同步。
2. 在管理后台撤销该应用密码。
3. 立即从三个浏览器触发同步。
4. 创建新的设备应用密码并只更新一个浏览器，确认新密码可以恢复访问。

预期：撤销后旧凭据立即返回 `401`，新凭据可用；账户主密码不能替代 WebDAV 应用密码。

当前状态：`BUG-001` 未修复前该项为 `BLOCKED`。本地烟测观察到撤销路由返回空 `404`，没有达到预期 `204`。

### FL-06：密文和恢复边界

1. 在书签中加入唯一测试标题和 URL 标记。
2. 在 API 容器数据目录、服务端日志和 Compose volume 中搜索该明文标记。
3. 验证服务端响应只返回加密文件，不显示书签树。
4. 执行一次文件版本恢复演练并记录恢复前后 ETag。

预期：服务端日志和存储中找不到书签标题、URL 和文件夹名称。

当前状态：密文检查可在真实 Floccus 流程中执行；历史版本恢复目前缺少 `file_versions` 表、恢复 API 和管理入口，标记为 `BLOCKED`，不能将其写成通过。

## 6. API 结果矩阵

| ID | 检查 | 预期 | 2026-08-25 本地结果 |
| --- | --- | --- | --- |
| DAV-01 | 未认证 GET | `401` + `WWW-Authenticate` | `PASS` |
| DAV-02 | 显式 CORS 预检 | `200` + 精确 Allow-Origin/Methods/Headers | `PASS` |
| DAV-03 | 集合 PROPFIND | `207` + 集合属性 | `PASS` |
| DAV-04 | 应用密码锁冲突 | 第二凭据 `423` | `PASS` |
| DAV-05 | 临时 PUT + MOVE | 首次 `201`，正式文件可读 | `PASS` |
| DAV-06 | HEAD/文件 PROPFIND | `200` / `207` + ETag | `PASS` |
| DAV-07 | 用户路径隔离 | 跨用户 `404` | `PASS` |
| DAV-08 | 撤销应用密码 | `204`，后续 WebDAV `401` | `FAIL`，见 `BUG-001` |

## 7. 缺陷和后续任务

### BUG-001：应用密码撤销路由返回空 404

- 复现：注册账户 → 创建应用密码 → `DELETE /api/v1/app-passwords/<uuid>`，携带有效 Bearer session token。
- 实际：`404 Not Found`，空响应体；不是 handler 返回的 JSON `not_found`。
- 预期：当前用户拥有且未撤销的应用密码返回 `204 No Content`，之后同一 Basic 凭据访问 WebDAV 返回 `401`。
- 影响：无法证明撤销应用密码立即阻断 Floccus，阻塞 FL-05 和 MVP 发布门槛。
- 处理：由后端窗口补充路由级集成测试并修复；修复后重跑 `DAV-08` 和 FL-05。

### GAP-002：历史版本恢复未形成可验收闭环

- 当前 migration 没有 `file_versions` 表，管理 API 没有恢复接口，后台没有恢复入口。
- 不能仅凭文件覆盖或 `dav_files.version` 字段宣称支持恢复。
- 在独立任务补齐存储版本、恢复权限、审计和 UI 后，再增加 FL-06 的通过证据。

## 8. 证据模板

```text
日期：
环境/提交：
API 版本：
Floccus 版本：
浏览器及版本：
测试配置文件：
应用密码名称（不写 secret）：
执行项：
结果：PASS / FAIL / BLOCKED / N/A
响应状态/ETag/文件大小：
截图或日志路径（脱敏）：
问题编号：
```

## 9. 清理和交付

- 撤销所有测试应用密码并清除本地响应文件、passphrase 和环境变量。
- 仅对专用测试 Compose 项目执行 `down -v`；共享开发数据库不得使用该命令。
- 删除一次性测试脚本和临时 fixture，不提交到正式包。
- 交付前确认发布包不含测试脚本、调试日志、开发地址、账户密码或书签明文。
