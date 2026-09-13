# 自部署与备份恢复演练

日期：2026-08-25  
任务：`deployment-recovery`  
结论：`SQLITE MIGRATION - RECOVERY RECHECK REQUIRED`

本文覆盖单机 Docker Compose 部署、Caddy 反向代理、SQLite 元数据和 WebDAV 加密文件的备份恢复边界。备份命令必须针对专用部署或恢复项目执行，不得对生产卷使用宽泛删除命令。

## 部署文件

- `docker-compose.yml`：开发和协议验收用基础编排，保留 `26626` 本地 API 端口；生产覆盖会清除其本地 build 配置并改用 GHCR 镜像。
- `docker-compose.production.yml`：生产覆盖，使用 GitHub Container Registry 中的 API/Web 镜像，移除 API 公网端口，增加 Caddy，并要求通过环境变量注入 CORS 和域名配置。
- `Caddyfile`：将 `/api/*`、`/dav/*`、`/health/*` 代理到 API，并提供管理后台静态文件；该配置已内置在 Web 镜像中。
- `.env.example`：生产变量模板，不包含可用凭据；真实 `.env` 不得提交。

## GitHub Container Registry 镜像

推送到 `main` 分支或创建 `v*.*.*` 标签后，GitHub Actions 会先执行管理后台和 API 测试，再发布两个镜像：

- `ghcr.io/<owner>/wotty-bookmark-api:<tag>`：Rust API，数据仍通过 `bookmark-data` 卷保存。
- `ghcr.io/<owner>/wotty-bookmark-web:<tag>`：管理后台静态文件和 Caddy。

首次使用前，在仓库的 **Settings → Actions → General** 确认允许 workflow 写入 packages；发布后如果镜像不是公开的，需要在 GHCR 包设置中将其设为公开，或在部署主机先执行 `docker login ghcr.io`。

部署主机只需复制 `.env.example` 为私有 `.env`，确认 `GHCR_NAMESPACE` 使用 GitHub 用户名/组织名的小写形式，然后拉取并启动镜像：

```bash
docker compose --env-file infra/.env \
  -f infra/docker-compose.yml \
  -f infra/docker-compose.production.yml pull
docker compose --env-file infra/.env \
  -f infra/docker-compose.yml \
  -f infra/docker-compose.production.yml up -d
```

如果要部署某个固定版本，将 `IMAGE_TAG` 改为 Actions 发布的 Git tag（例如 `v0.0.59`），不要依赖 `latest`。仓库当前所有者是 `sevencnup`；如果仓库转移到其他组织，需同步修改 `GHCR_NAMESPACE`。

## 生产部署

1. 复制 `infra/.env.example` 为部署主机上的私有 `.env`，替换正式域名、CORS 来源和镜像命名空间。
2. 使用生产覆盖检查合并配置，并确认没有缺失必需变量：

   ```bash
   docker compose --env-file infra/.env \
     -f infra/docker-compose.yml \
     -f infra/docker-compose.production.yml config --quiet
   ```

3. 拉取并启动或升级服务：

   ```bash
   docker compose --env-file infra/.env \
     -f infra/docker-compose.yml \
     -f infra/docker-compose.production.yml pull
   docker compose --env-file infra/.env \
     -f infra/docker-compose.yml \
     -f infra/docker-compose.production.yml up -d
   ```

4. 验证 API 健康检查和 Caddy 路由：

   ```bash
   curl --fail https://bookmarks.example.com/health/live
   docker compose --env-file infra/.env \
     -f infra/docker-compose.yml \
     -f infra/docker-compose.production.yml ps
   ```

API 只加入 Compose 内部网络；公网只暴露 Caddy 的 80/443。SQLite 数据库和 WebDAV 文件都保存在 `bookmark-data` 卷中。Caddy 的证书和状态保存在 `caddy-data` 与 `caddy-config` 卷中，也应纳入主机级备份。

## 备份边界

需要分别备份以下内容：

1. `bookmark-data`：SQLite 数据库、账户/应用密码元数据、文件版本和 Floccus 上传的 opaque blob。启用 Floccus passphrase 后，文件本身是客户端加密内容，服务端不解析书签。
2. `caddy-data` 和 `caddy-config`：HTTPS 证书及 Caddy 状态；也可以在恢复主机上让 Caddy 重新签发证书。
3. `.env` 中的 CORS 和 Caddy 域名配置：单独使用受控密钥管理，不将其与公开备份放在一起。

示例备份命令（在已配置的 Compose 项目目录执行）：

```bash
BACKUP_DIR="$(mktemp -d)"
docker compose cp api:/var/lib/bookmark-vault "$BACKUP_DIR/bookmark-data"
tar -C "$BACKUP_DIR" -czf "$BACKUP_DIR/bookmark-data.tar.gz" bookmark-data
openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt \
  -in "$BACKUP_DIR/bookmark-data.tar.gz" \
  -out "$BACKUP_DIR/bookmark-data.tar.gz.enc"
sha256sum "$BACKUP_DIR/bookmark-data.tar.gz.enc"
```

备份加密口令必须通过独立密钥管理系统交付。命令结束后删除临时目录，或将加密文件移动到经过访问控制的备份存储；不要保留未加密的 tar 和临时数据库 dump。

## 隔离恢复演练

恢复演练必须使用新的 Compose 项目名和新的卷，避免影响正在运行的服务。核心步骤如下：

```bash
RECOVERY_PROJECT="bookmark-vault-recovery-$(date +%s)"
docker compose -p "$RECOVERY_PROJECT" up -d api
docker compose -p "$RECOVERY_PROJECT" cp \
  "$BACKUP_DIR/bookmark-data/." api:/var/lib/bookmark-vault/
docker compose -p "$RECOVERY_PROJECT" exec -T api \
  find /var/lib/bookmark-vault -type f -print -exec sha256sum {} \;
docker compose -p "$RECOVERY_PROJECT" down -v
```

验收证据至少应包含：备份归档校验和、恢复后 SQLite 文件和 opaque blob 校验和、`/health/live` 返回 200，以及未影响原部署项目的证明。恢复结束只允许删除本次演练生成的精确项目和卷。

PostgreSQL 版本的历史演练记录不适用于当前 SQLite 数据格式；切换后需要重新执行一次隔离恢复演练。

## 历史版本清理状态

历史版本能力已通过 `migrations/0002_file_versions.sql` 补齐。正式 `bookmarks.xbel` 被 PUT 覆盖、被 MOVE 覆盖或执行恢复前，API 会将当前 opaque blob 保存到 `DATA_DIR/.versions/<user-id>/<dav-file-id>/<version-id>.blob`，并在 SQLite `file_versions` 中记录快照元数据。服务端不解析或记录书签明文。

管理 API 使用登录会话鉴权：

- `GET /api/v1/storage/versions`：列出当前用户的历史版本元数据。
- `POST /api/v1/storage/versions/{id}/restore`：恢复指定版本；当前 WebDAV 锁存在时返回 `423`，恢复前先保存当前文件。
- `POST /api/v1/storage/versions/cleanup`：清理每个文件超过最近 30 条的旧版本；每次新快照也会自动执行同一保留策略。

当前实现已覆盖快照写入、恢复和清理，因此：

- `dav_files.version` 仅作为当前文件变更计数，实际恢复数据来自 `file_versions` 快照。
- 删除当前 WebDAV 文件会按现有协议移除其 `dav_files` 元数据，关联历史快照随外键级联删除；恢复能力针对正式文件的覆盖和恢复操作。
- 快照目录属于数据卷内部路径，不会通过 `/dav/` 资源路由直接暴露。

本次后续验收已验证：首次写入返回 `201`，覆盖前生成快照，版本列表可读，恢复返回 `200` 且内容回到旧版本，连续产生 31 个快照后保留最近 30 条；历史版本恢复缺口 `GAP-002` 已关闭。
