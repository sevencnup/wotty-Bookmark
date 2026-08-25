# MVP 发布封板清单

审计日期：2026-08-25  
审计任务：`release-readiness-audit`  
当前结论：`NO-GO / NOT READY`

本清单汇总当前已经产生的验证证据、未完成任务和发布前的关闭顺序。只有所有 `BLOCKED` 项关闭并重新执行对应验收，才能创建正式发布包或推送 GitHub。

## 当前门槛矩阵

| 门槛 | 状态 | 证据或剩余工作 |
| --- | --- | --- |
| MVP 范围和 Floccus/WebDAV 边界 | `PASS` | 侧边栏只操作浏览器原生书签；服务端保存 opaque blob；不引入第二套同步协议。 |
| 后端认证和 WebDAV 协议 | `PASS` | Cargo 测试 12 项、Clippy、Compose 烟测通过；DAV-01～DAV-08 均有通过记录；应用密码撤销返回 `204`，旧 WebDAV 凭据返回 `401`。 |
| 管理后台 API 链路 | `PASS` | 注册、登录、存储状态、应用密码创建/列表/撤销通过；lint、3 项测试和生产构建通过。 |
| 管理后台浏览器级 E2E | `BLOCKED` | 当前环境没有 Chrome、Edge、Firefox；账户删除按钮仍是展示控件，未纳入通过项。 |
| 侧边栏生产构建 | `PASS` | TypeScript、3 项单测、Chrome MV3 和 Firefox MV2 构建通过。 |
| 侧边栏真实浏览器回归 | `BLOCKED` | 三浏览器和 Floccus 不可用；且 `frontend-bookmark-management-ui` 仍在进行中，需完成后重新构建和回归。 |
| Floccus 三浏览器同步 | `BLOCKED` | FL-01～FL-05 因缺少浏览器/Floccus 保持阻塞，不能用服务端 curl 烟测替代。 |
| 历史版本恢复与清理 | `BLOCKED` | `GAP-002`：当前缺少 `file_versions` 快照表、恢复 API/权限、审计和清理机制；`history-version-recovery` 正在处理。 |
| 自部署和当前文件恢复 | `PASS` | 生产 Compose/Caddy 校验通过；隔离项目完成 PostgreSQL 与加密 opaque 文件备份恢复，SHA-256 一致。 |
| 干净环境依赖安装 | `BLOCKED` | 根目录缺少 `pnpm-workspace.yaml`，不满足统一 workspace 和 `workspace:*` 依赖的封板要求；需先补齐并重新执行根级安装/测试。 |
| 扩展商店资料 | `BLOCKED` | Firefox 仍使用占位 ID；缺少正式图标、截图、公开 HTTPS 隐私政策 URL、支持页和主页。详情见扩展 [`RELEASE_AUDIT.md`](../apps/sidebar-extension/RELEASE_AUDIT.md)。 |

## 阻塞项关闭顺序

### R-001：完成历史版本快照和恢复闭环

负责人：`worker-e04a`（任务 `history-version-recovery`）

- 增加 `file_versions` 数据结构和迁移。
- 在正式文件覆盖前保存可恢复快照。
- 提供受权限保护的恢复入口、审计记录和保留周期清理。
- 补充 API/存储测试，并重新执行 FL-06 和部署恢复演练。

### R-002：完成前端管理界面收敛

负责人：`worker-a66f`（任务 `frontend-bookmark-management-ui`）

- 完成当前进行中的管理后台/书签管理界面变更。
- 在提交前执行 admin-web 和 sidebar-extension 的类型检查、测试、生产构建。
- 重新核对不引入 WebDAV 或第二套同步逻辑。
- 由具备浏览器的环境执行管理后台和侧边栏点击级回归。

### R-003：恢复根 workspace 封板条件

- 补齐根 `pnpm-workspace.yaml`，覆盖 `apps/*` 和 `packages/*` Node 项目。
- 在根目录执行一次 `pnpm install`，不得在子项目单独安装依赖。
- 在干净环境执行根级 `pnpm test`、`pnpm lint` 以及各项目构建。
- 确认锁文件、workspace 依赖和构建产物没有污染正式包。

### R-004：完成真实浏览器和 Floccus 验收

使用独立浏览器配置文件和测试账户，按 [`docs/floccus-integration-qa.md`](floccus-integration-qa.md) 执行：

- Chrome、Edge、Firefox 首次上传、下载和加密 XBEL。
- 书签新增、编辑、移动、删除、排序和最终收敛。
- 侧边栏本地写入后由 Floccus 同步到其他浏览器。
- 断网恢复、并发锁、临时文件、撤销应用密码和新凭据恢复。
- FL-06 密文边界及历史版本恢复。

每项必须记录浏览器/Floccus 版本、响应状态、ETag、文件大小和脱敏证据；环境不足时继续标记 `BLOCKED`。

### R-005：补齐商店提交资料

- 替换 Firefox `gecko.id` 占位值，固定正式唯一 ID。
- 提供 16/32/48/128 像素 PNG 图标和不含私人数据的截图。
- 将隐私政策发布到公开 HTTPS 地址，填写支持页、主页和联系方式。
- 在干净目录打包 Chrome/Edge MV3 与 Firefox MV2，确认不含 `.wxt`、`node_modules`、测试脚本、源代码、开发地址或调试产物。

## 封板前命令顺序

```text
# 根 workspace 修复后
pnpm install
pnpm test
pnpm lint

# 后端
cargo test --manifest-path services/api/Cargo.toml
cargo clippy --manifest-path services/api/Cargo.toml --all-targets -- -D warnings

# 前端和扩展
pnpm --filter @bookmark-vault/admin-web build
pnpm --filter @bookmark-vault/admin-web test
pnpm --filter @bookmark-vault/sidebar-extension typecheck
pnpm --filter @bookmark-vault/sidebar-extension test
pnpm --filter @bookmark-vault/sidebar-extension build
pnpm --filter @bookmark-vault/sidebar-extension build:firefox

# 部署
docker compose -f infra/docker-compose.yml config --quiet
docker compose --env-file infra/.env \
  -f infra/docker-compose.yml \
  -f infra/docker-compose.production.yml config --quiet
```

所有窗口完成各自任务后，由协调窗口再次运行协同 `status`、`lead-cycle` 和最终 `check`，确认工作区只包含已认领范围，并先本地提交。未经明确命令不推送 GitHub。
