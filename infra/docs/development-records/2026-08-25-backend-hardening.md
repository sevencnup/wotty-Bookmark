# 后端加固开发记录

## 日期

2026-08-25

## 任务

完成 `backend-hardening`：加固 API 的 CORS 白名单、认证限流、应用密码 WebDAV 锁边界，并保持 Floccus WebDAV 方法和路径协议兼容。

## 执行进度

- 将宽泛 CORS 改为 `CORS_ALLOWED_ORIGINS` 精确来源列表，覆盖管理 API 与 WebDAV 所需方法、请求头和响应头。
- 为登录和 WebDAV Basic 认证加入进程内窗口限流，并返回 `429` 与 `Retry-After`。
- 改进 Basic/Bearer 认证解析，支持大小写不敏感的认证方案并拒绝畸形凭据。
- 增加 `/dav/{账号}/` 集合级 `PROPFIND`，补充资源属性、`Depth` 响应和 `DAV: 1` 能力声明。
- 为 WebDAV 临时上传使用唯一临时文件，支持 `MOVE` 的绝对/相对 `Destination` 和 `Overwrite` 语义。
- 将锁文件绑定到应用密码，锁有效期内限制非持有者写入、移动和删除，超时后自动释放。
- 更新 Compose 和 API 环境变量模板，记录部署安全边界。

## 验证

- `cargo test --manifest-path services/api/Cargo.toml`：11 项通过。
- `cargo clippy --manifest-path services/api/Cargo.toml --all-targets -- -D warnings`：通过。
- `git diff --check`：通过。

## 后续注意

当前限流状态保存在单个 API 进程内；多实例部署前需要接入共享限流存储。`CORS_ALLOWED_ORIGINS` 必须使用显式来源，不应配置通配符。
