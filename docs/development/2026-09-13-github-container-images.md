# GitHub Container Registry 镜像发布

## 目标

为项目增加 GitHub Actions 自动测试、构建和发布 Docker 镜像的能力，让生产部署主机可以直接拉取镜像，不需要安装 Rust/Node.js 或手动构建管理后台。

## 执行步骤

1. 为 Rust API 保留独立的多阶段 Docker 镜像构建。
2. 为管理后台和 Caddy 增加多阶段 Docker 镜像构建，将前端静态文件内置到镜像。
3. 增加 GitHub Actions，在 `main` 和版本标签推送时运行测试并发布 API/Web 两个 GHCR 镜像。
4. 修改生产 Compose，默认从 GHCR 拉取镜像，并保留数据库、书签文件和证书在 Docker 卷中。
5. 更新部署文档、环境变量模板和版本记录。
6. 校验 Compose 合并配置、Dockerfile 内容和工作区测试。
7. 根据首次 Actions 构建日志，将 API 构建镜像 Rust 版本固定到依赖要求的 1.88。

## 验收标准

- 推送到 GitHub 后，workflow 具备 `packages: write` 权限并发布两个 GHCR 镜像。
- 生产 Compose 不再依赖宿主机的 `apps/admin-web/dist` 目录。
- API 镜像不包含运行时数据库；数据库和书签数据仍保存在 `bookmark-data` 卷。
- Web 镜像包含管理后台静态文件和 Caddy 配置。
- 部署文档明确 GHCR 登录、镜像标签、数据卷和升级方式。
