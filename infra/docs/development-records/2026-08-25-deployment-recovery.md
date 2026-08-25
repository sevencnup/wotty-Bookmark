# 自部署与备份恢复开发记录

## 日期

2026-08-25

## 任务

执行 `deployment-recovery`：验证 Docker Compose、Caddy、环境变量、PostgreSQL 和 WebDAV 加密文件的自部署与恢复边界。

## 执行进度

- 增加生产 Compose 覆盖配置，生产模式不再向公网暴露 PostgreSQL 和 API 端口，并通过 Caddy 统一提供 HTTPS、管理后台和 API/WebDAV 入口。
- 增加生产环境变量模板和健康检查，明确数据库密码、连接串、CORS 来源和域名必须由部署环境注入。
- 编写隔离恢复演练步骤，覆盖 PostgreSQL 自定义格式备份、加密文件备份、校验和、恢复到新 Compose 项目及恢复后验证。
- 核对 API 镜像以非 root `app` 用户运行，基础 Compose 配置和生产覆盖配置可通过 Compose 合并校验。
- 确认历史版本清理仍受 `file_versions` 快照、恢复接口和清理策略缺失阻塞，记录为 `GAP-002`，未将计数器误报为版本恢复能力。

## 验证

- `docker compose -f infra/docker-compose.yml config --quiet`：通过。
- 生产 Compose 合并配置校验：通过（使用示例环境变量模板）；生产模式不暴露 PostgreSQL 和 API 端口。
- Caddy `caddy validate`：通过；生产栈实际启动 Caddy、API 和 PostgreSQL 均成功。
- 隔离 PostgreSQL/加密文件恢复演练：通过；恢复出 1 条 `dav_files` 记录，解密备份文件与恢复容器文件 SHA-256 一致。
- 历史版本清理：阻塞，原因是当前实现尚无 `file_versions` 快照表和清理机制。
