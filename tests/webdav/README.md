# WebDAV 协议烟测

本目录保存 Bookmark Vault WebDAV/Floccus 集成验收的可重复命令和结果约定。命令只验证服务端协议，不替代官方 Floccus 在真实浏览器中的黑盒验收；真实浏览器流程见 [`docs/floccus-integration-qa.md`](../../docs/floccus-integration-qa.md)。

## 使用边界

- 所有账号、应用密码、Floccus passphrase 和书签内容只能使用临时测试数据。
- 不要开启 shell trace，不要把 Authorization 请求头或响应中的应用密码写入日志。
- 以下命令应在一次性 shell 会话中执行；临时响应文件使用 `mktemp`，结束时删除。
- 不要在共享或生产数据库上执行清理命令。推荐使用独立 Compose 项目和独立数据卷。
- 注册接口字段是 `loginIdentifier`；登录接口字段是 `login_identifier`，这是当前 API 的实际 JSON 契约。

## 启动和变量

```bash
docker compose -f infra/docker-compose.yml config --quiet
CORS_ALLOWED_ORIGINS=http://localhost:5173 \
  docker compose -f infra/docker-compose.yml up -d --build

API_BASE=http://127.0.0.1:8080
QA_USER="qa-$(date +%s)"
QA_PASSWORD='QaWebdavPassword_2026!'
```

等待以下检查返回 `200` 和 `status=ok`：

```bash
curl --fail --silent --show-error "$API_BASE/health/live"
```

## 创建临时账号和应用密码

下面的 JSON 解析依赖 Python 标准库，不需要额外安装 `jq`：

```bash
register_response="$(mktemp)"
app_response="$(mktemp)"

curl --fail-with-body --silent --show-error \
  -X POST "$API_BASE/api/v1/auth/register" \
  -H 'Content-Type: application/json' \
  --data "{\"loginIdentifier\":\"$QA_USER\",\"password\":\"$QA_PASSWORD\"}" \
  >"$register_response"

SESSION_TOKEN="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["token"])' "$register_response")"
USER_ID="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["user"]["id"])' "$register_response")"

curl --fail-with-body --silent --show-error \
  -X POST "$API_BASE/api/v1/app-passwords" \
  -H "Authorization: Bearer $SESSION_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"name":"qa-webdav"}' \
  >"$app_response"

APP_ID="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["id"])' "$app_response")"
APP_SECRET="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["secret"])' "$app_response")"
DAV_URL="$API_BASE/dav/$QA_USER"
```

应用密码只在创建响应中出现一次；完成测试后清除当前 shell 中的变量：

```bash
rm -f -- "$register_response" "$app_response"
unset SESSION_TOKEN APP_SECRET APP_ID USER_ID QA_PASSWORD
```

## 方法和预期状态

使用 `curl -o /dev/null -w '%{http_code}'` 检查状态码，并保留必要响应头作为证据：

| 检查 | 命令要点 | 预期 |
| --- | --- | --- |
| 未认证读取 | `GET $DAV_URL/bookmarks.xbel` | `401`，带 `WWW-Authenticate` |
| 错误应用密码 | Basic 用户名 + 错误 secret | `401` |
| 普通 OPTIONS | `OPTIONS $DAV_URL/bookmarks.xbel` | `204` |
| CORS 预检 | `Origin`、`Access-Control-Request-Method: PROPFIND`、`Access-Control-Request-Headers: Authorization,Depth` | `200`，包含显式 `Access-Control-Allow-Origin`、允许方法和请求头 |
| 集合查询 | `PROPFIND $DAV_URL/`，`Depth: 1` | `207`，包含 `DAV: 1` 集合属性 |
| 创建锁 | `PUT $DAV_URL/bookmarks.xbel.lock` | `201` |
| 其他应用密码抢锁 | 同一账号的第二个应用密码创建锁 | `423` |
| 临时上传 | `PUT $DAV_URL/bookmarks.xbel.temp` | 首次 `201` |
| 原子替换 | `MOVE` 临时文件到 `bookmarks.xbel`，`Overwrite: T` | 首次 `201` |
| 文件读取 | `GET` 正式文件 | `200`，内容与上传 fixture 一致 |
| 文件属性 | `HEAD` 和文件级 `PROPFIND` | `200` / `207`，有长度、ETag、Last-Modified |
| 锁释放 | `DELETE $DAV_URL/bookmarks.xbel.lock` | `204` |
| 路径隔离 | 用户 B 凭据访问用户 A 路径 | `404` |
| 应用密码撤销 | 管理 API `DELETE /api/v1/app-passwords/{id}` | `204`，之后 WebDAV 为 `401` |

## 最小 WebDAV 顺序

锁、临时文件和 MOVE 必须按以下顺序执行；fixture 仅用于验证 opaque blob 行为：

```bash
fixture="opaque-fixture-not-a-floccus-payload"

curl --silent --show-error -X PUT -u "$QA_USER:$APP_SECRET" \
  --data-binary "$fixture" "$DAV_URL/bookmarks.xbel.lock"

curl --silent --show-error -X PUT -u "$QA_USER:$APP_SECRET" \
  --data-binary "$fixture" "$DAV_URL/bookmarks.xbel.temp"

curl --silent --show-error -X MOVE -u "$QA_USER:$APP_SECRET" \
  -H "Destination: $DAV_URL/bookmarks.xbel" \
  -H 'Overwrite: T' \
  "$DAV_URL/bookmarks.xbel.temp"

curl --silent --show-error -u "$QA_USER:$APP_SECRET" \
  "$DAV_URL/bookmarks.xbel"

curl --silent --show-error -X DELETE -u "$QA_USER:$APP_SECRET" \
  "$DAV_URL/bookmarks.xbel.lock"
```

## 当前结果

2026-08-25 本地 Compose 烟测已覆盖健康检查、显式 CORS 预检、未认证拒绝、集合/文件 PROPFIND、应用密码锁冲突、临时 PUT、MOVE、HEAD、GET、路径隔离、锁释放和应用密码撤销。上述检查通过；提交 `2bc91c6` 中 `DELETE /api/v1/app-passwords/<uuid>` 返回 `204`，撤销后同一 WebDAV 凭据返回 `401`。

真实 Chrome、Edge、Firefox 和 Floccus 黑盒验收仍需在具备浏览器的环境中执行，不能以本地 Compose 烟测替代。

## 清理

测试结束后优先使用管理 API 撤销应用密码。若验收过程中遇到 `BUG-001`，只能在明确为一次性测试数据库、且已核对精确 UUID 后清理测试用户及其数据目录；禁止对共享数据库使用宽泛删除命令。一次性脚本、临时响应文件和生成的测试 fixture 不得提交到仓库。
