# Floccus 三浏览器黑盒验收开发记录

## 日期

2026-08-25

## 任务

执行 `manual-floccus-qa`：检查 Chrome、Edge、Firefox 和官方 Floccus 的真实黑盒验收条件，并更新可复验的 QA 记录。

## 进度

- 检查 `google-chrome`、`chromium`、`microsoft-edge`、`firefox` 命令，均不可用。
- 检查对应系统包，Chrome、Chromium、Edge 和 Firefox 均未安装。
- 未发现可用的 Floccus 客户端或浏览器扩展运行实例。
- 因缺少浏览器和 Floccus，FL-01～FL-05 真实同步、离线修改、冲突锁、撤销和收敛流程标记为 `BLOCKED`，保留人工执行步骤，不伪造通过证据。
- 将后端提交 `2bc91c6` 已完成的 DAV-08 服务端验证回写为 `PASS`：撤销返回 `204`，旧 WebDAV 凭据返回 `401`。
- 保留 `GAP-002` 历史版本恢复缺口为独立阻塞项。

## 后续

具备 Chrome、Edge、Firefox 稳定版和固定 Floccus 版本后，使用独立浏览器配置文件按 `docs/floccus-integration-qa.md` 执行 FL-01～FL-06，并补充版本、响应状态、ETag、日志和截图等脱敏证据。
