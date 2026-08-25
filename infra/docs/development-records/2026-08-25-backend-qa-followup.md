# 后端 QA 遗留修复开发记录

## 日期

2026-08-25

## 任务

完成 `backend-qa-followup`：修复应用密码撤销接口的路由匹配问题，并确认撤销后 WebDAV 凭据立即失效。

## 执行进度

- 定位 Axum 0.7 使用 `:id` 路由参数语法；原 `{id}` 被当作字面路径，导致撤销请求返回空 `404`。
- 将应用密码撤销路由改为 Axum 0.7 兼容写法，并抽出路由构建函数便于回归验证。
- 增加 Router 级回归测试，确保应用密码 ID 路由能够匹配并进入参数提取流程。
- 补充本地 Compose 验收：撤销接口返回 `204`，撤销后的同一 WebDAV Basic 凭据返回 `401`。
- 历史版本恢复缺口仍按 `GAP-002` 保留，等待独立的版本恢复任务闭环。

## 验证

- `cargo fmt --manifest-path services/api/Cargo.toml`：通过。
- `cargo test --manifest-path services/api/Cargo.toml`：12 项通过。
- 本地 Compose API 重建：通过。
- 应用密码撤销与 WebDAV 失效链路：通过。
