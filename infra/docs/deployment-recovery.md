# 自部署与备份恢复演练

日期：2026-08-25  
任务：`deployment-recovery`  
结论：`PARTIAL - HISTORY RETENTION BLOCKED`

本文覆盖单机 Docker Compose 部署、Caddy 反向代理、PostgreSQL 元数据和 WebDAV 加密文件的备份恢复边界。备份命令必须针对专用部署或恢复项目执行，不得对生产卷使用宽泛删除命令。

## 部署文件

- `docker-compose.yml`：开发和协议验收用基础编排，保留 `5433` 和 `8080` 本地端口。
- `docker-compose.production.yml`：生产覆盖，移除 PostgreSQL/API 公网端口，增加 Caddy，并要求通过环境变量注入数据库、CORS 和域名配置。
- `Caddyfile`：将 `/api/*`、`/dav/*`、`/health/*` 代理到 API，并提供管理后台静态文件。
- `.env.example`：生产变量模板，不包含可用凭据；真实 `.env` 不得提交。

## 生产部署

1. 构建管理后台静态文件：

   ```bash
   pnpm --filter @bookmark-vault/admin-web build
   ```

2. 复制 `infra/.env.example` 为部署主机上的私有 `.env`，替换随机数据库密码和正式域名。`DATABASE_URL` 中的保留字符必须 URL 编码。
3. 使用生产覆盖检查合并配置，并确认没有缺失必需变量：

   ```bash
   docker compose --env-file infra/.env \
     -f infra/docker-compose.yml \
     -f infra/docker-compose.production.yml config --quiet
   ```

4. 启动或升级服务：

   ```bash
   docker compose --env-file infra/.env \
     -f infra/docker-compose.yml \
     -f infra/docker-compose.production.yml up -d --build
   ```

5. 验证 API 健康检查和 Caddy 路由：

   ```bash
   curl --fail https://bookmarks.example.com/health/live
   docker compose --env-file infra/.env \
     -f infra/docker-compose.yml \
     -f infra/docker-compose.production.yml ps
   ```

PostgreSQL 和 API 只加入 Compose 内部网络；公网只暴露 Caddy 的 80/443。Caddy 的证书和状态保存在 `caddy-data` 与 `caddy-config` 卷中，也应纳入主机级备份。

## 备份边界

需要分别备份以下内容：

1. PostgreSQL：账户、会话、应用密码哈希和 `dav_files` 元数据。
2. `bookmark-data`：Floccus 上传的 opaque blob。启用 Floccus passphrase 后，文件本身是客户端加密内容，服务端不解析书签。
3. `caddy-data` 和 `caddy-config`：HTTPS 证书及 Caddy 状态；也可以在恢复主机上让 Caddy 重新签发证书。
4. `.env` 中的数据库连接和 Caddy 域名配置：单独使用受控密钥管理，不将其与公开备份放在一起。

示例备份命令（在已配置的 Compose 项目目录执行）：

```bash
BACKUP_DIR="$(mktemp -d)"
docker compose exec -T postgres pg_dump \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom \
  > "$BACKUP_DIR/bookmark-vault.dump"
docker compose cp api:/var/lib/bookmark-vault "$BACKUP_DIR/bookmark-data"
tar -C "$BACKUP_DIR" -czf "$BACKUP_DIR/bookmark-data.tar.gz" bookmark-data
openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt \
  -in "$BACKUP_DIR/bookmark-data.tar.gz" \
  -out "$BACKUP_DIR/bookmark-data.tar.gz.enc"
sha256sum "$BACKUP_DIR/bookmark-vault.dump" "$BACKUP_DIR/bookmark-data.tar.gz.enc"
```

备份加密口令必须通过独立密钥管理系统交付。命令结束后删除临时目录，或将加密文件移动到经过访问控制的备份存储；不要保留未加密的 tar 和临时数据库 dump。

## 隔离恢复演练

恢复演练必须使用新的 Compose 项目名和新的卷，避免影响正在运行的服务。核心步骤如下：

```bash
RECOVERY_PROJECT="bookmark-vault-recovery-$(date +%s)"
docker compose -p "$RECOVERY_PROJECT" up -d postgres api
docker compose -p "$RECOVERY_PROJECT" exec -T postgres \
  pg_restore --clean --if-exists --no-owner \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$BACKUP_DIR/bookmark-vault.dump"
docker compose -p "$RECOVERY_PROJECT" cp \
  "$BACKUP_DIR/bookmark-data/." api:/var/lib/bookmark-vault/
docker compose -p "$RECOVERY_PROJECT" exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c 'SELECT COUNT(*) AS restored_dav_files FROM dav_files;'
docker compose -p "$RECOVERY_PROJECT" exec -T api \
  find /var/lib/bookmark-vault -type f -print -exec sha256sum {} \;
docker compose -p "$RECOVERY_PROJECT" down -v
```

验收证据至少应包含：dump 校验和、恢复后 `dav_files` 行数、恢复后 opaque blob 校验和、`/health/live` 返回 200，以及未影响原部署项目的证明。恢复结束只允许删除本次演练生成的精确项目和卷。

本次隔离演练结果：新建恢复项目恢复出 1 条 `dav_files` 记录；解密后的备份文件与恢复容器中的文件 SHA-256 均为 `04f3d98e64dd1d42fd60c12b5e0c00a51ea6a23c6dc012dab744f804becc16a4`。演练使用的两个 Compose 项目、卷和临时备份已清理。

## 历史版本清理状态

当前实现只有 `dav_files.version` 计数和当前文件，migration 尚未提供 `file_versions` 表，WebDAV 覆盖也没有保存历史快照。因此：

- 当前不能执行或宣称通过“保留最近 10～30 个历史版本”的清理演练。
- `dav_files.version` 不能代替可恢复的历史文件。
- 需要后续任务补齐快照写入、恢复 API/权限、审计记录和按保留周期清理，再重新执行恢复验收。

本次已验证可恢复当前 PostgreSQL 元数据和当前加密文件；历史版本保留/清理标记为 `BLOCKED (GAP-002)`。
