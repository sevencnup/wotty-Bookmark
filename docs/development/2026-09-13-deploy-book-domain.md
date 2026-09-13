# book.sevencn.com 部署与路由修复开发记录

## 目标

将 HK 上的 wotty-bookmark 部署切换到 book.sevencn.com，并确保 /api、/dav、/health 路由不会被前端 SPA 的兜底页面拦截。

## 实施步骤

1. 确认域名解析与证书状态。
2. 为外层反向代理配置 HTTPS。
3. 将 API CORS 来源切换到正式域名。
4. 固定 Caddy 路由顺序，先处理 API、WebDAV 和健康检查，再处理前端静态资源。
5. 执行前端构建、API 测试与镜像构建。
6. 更新 HK 项目并验证首页、API 未登录响应和健康接口。
7. 更新版本记录并创建本地 Git 提交。

## 验收标准

- https://book.sevencn.com/ 返回 200。
- https://book.sevencn.com/api/v1/devices 返回 API 的未登录响应，而不是 index.html。
- /health/live 返回 API 健康 JSON。
- API 与 Web 容器保持运行，现有 Docker 数据卷不被删除。
