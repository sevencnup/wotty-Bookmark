# 历史版本恢复开发记录

## 日期

2026-08-25

## 任务

完成 `history-version-recovery`：补齐 WebDAV 正式文件覆盖前的历史快照、会话鉴权恢复 API 和按保留数量清理机制。

## 执行进度

- 新增 `file_versions` migration，记录快照 ID、所属文件、opaque storage key、ETag、大小和创建时间。
- 正式 `bookmarks.xbel` 被 PUT 覆盖、MOVE 覆盖或恢复前，保存当前文件到 data volume 的隐藏版本目录。
- 新增历史版本列表、恢复和清理 API；恢复前检查 WebDAV 锁并保存当前版本，避免恢复操作不可逆。
- 默认每个文件保留最近 30 个版本；生成快照后自动清理，另提供显式清理接口。
- 保持用户隔离：版本列表和恢复查询均通过当前会话与 `dav_files.user_id` 绑定。

## 验证

- `cargo test --manifest-path services/api/Cargo.toml`：12 项通过。
- `cargo clippy --manifest-path services/api/Cargo.toml --all-targets -- -D warnings`：通过。
- `docker compose -f infra/docker-compose.yml config --quiet`：通过。
- Compose 历史版本流程：首次 PUT `201`、覆盖 PUT `204`、MOVE 覆盖 `204`、版本列表 1 条、恢复 `200` 且内容恢复。
- 恢复前自动保存当前内容，恢复后版本数为 2；连续生成 31 条快照后保留 30 条，显式清理接口返回成功。
- 测试用户和测试文件已按精确用户 UUID 清理；一次性响应文件已删除。
