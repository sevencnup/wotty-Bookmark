# 集成验收开发记录

## 日期

2026-08-25

## 任务

执行 `integration-qa`：建立 WebDAV 协议烟测和官方 Floccus 三浏览器集成验收材料。

## 进度

- 新增 `tests/webdav/README.md`，记录账户创建、应用密码、CORS、锁、PUT、MOVE、PROPFIND、路径隔离和撤销验证方法。
- 新增 `docs/floccus-integration-qa.md`，记录 Chrome、Edge、Firefox、Floccus 和侧边栏的人工验收流程、结果矩阵、证据模板和清理规则。
- 本地 Compose 烟测已验证健康检查、显式 CORS 预检、WebDAV 认证、锁冲突、临时文件原子替换、文件属性、路径隔离和锁释放。
- 当前发现 `BUG-001`：应用密码撤销路由返回空 `404`，阻塞撤销后的 WebDAV 失效验收。
- 当前发现 `GAP-002`：历史版本恢复尚未形成数据库、API 和管理后台闭环。
- 当前环境未安装 Chrome、Edge、Firefox 或 Floccus，真实三浏览器黑盒验收待具备浏览器环境后执行。

## 后续衔接

1. 后端窗口修复 `BUG-001` 并补充撤销路由集成测试。
2. 在三种浏览器和固定 Floccus 版本环境中执行 FL-01～FL-05。
3. 补齐历史版本恢复后再执行 FL-06，不将当前能力标记为通过。
