# 数据备份下载与还原开发记录

## 任务

为管理后台数据备份增加单份备份下载和整体还原能力，形成可迁移的服务器级备份闭环。

## 范围

1. 将已有备份目录打包为 ZIP，支持管理后台下载指定备份。
2. 还原前自动创建当前数据保护快照，并校验备份结构。
3. 整体替换 SQLite、服务器主密钥、同步文件和历史版本，避免只恢复数据库造成密钥不匹配。
4. 恢复期间使用进程内互斥锁和临时目录，失败时尽量回滚，完成后重新加载索引。
5. 增加 API、前端操作确认、回归测试，并更新开发/版本记录。

## 执行步骤

1. 增加备份归档格式与安全路径校验。
2. 增加备份列表下载和还原 API。
3. 增加后台下载、还原操作及风险提示。
4. 执行 Rust 测试、前端测试、lint 和构建。
5. 更新开发记录与版本记录，完成本地 Git 提交。

## 验证

- `cargo fmt --manifest-path services/api/Cargo.toml -- --check`：通过。
- `cargo test --manifest-path services/api/Cargo.toml`：37 项通过。
- `pnpm.cmd --filter @bookmark-vault/admin-web test`：24 项通过。
- `pnpm.cmd --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm.cmd --filter @bookmark-vault/admin-web build`：通过。
