# 管理后台开发记录

## 2026-08-25：`frontend-bookmark-management-ui`

### 任务

按产品参考图完成独立的管理后台书签工作区。管理后台与浏览器侧边栏保持两个独立入口，不共享页面状态，也不让后台读取 Floccus 密文中的书签内容。

### 进度

- 新增截图对应的管理后台布局：侧边导航、书签管理顶部栏、统计卡片、工具栏、列表/网格视图和分页区域。
- 增加搜索、分类筛选、全选、创建、编辑、移入回收站和操作提示等前端交互。
- 保留现有登录、概览、应用密码、Floccus 配置和账户安全页面。
- 书签工作区使用前端本地示例状态承载视觉和交互验收；服务端仍只保存 Floccus 加密数据，后续接入真实书签来源需单独设计 API 边界。
- 复核 `apps/sidebar-extension` 仍为独立浏览器原生书签侧边栏，不接入 WebDAV。

### 验证

- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：3 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。
- `pnpm --filter @bookmark-vault/sidebar-extension typecheck`：通过。
- `pnpm --filter @bookmark-vault/sidebar-extension test`：3 项通过。
- `pnpm --filter @bookmark-vault/sidebar-extension build`：通过。
- `pnpm --filter @bookmark-vault/sidebar-extension build:firefox`：通过。

## 2026-08-25

### 任务

完成 `admin-console-qa`：验收管理后台的构建、页面可达性和注册、登录、存储状态、应用密码管理链路。

### 进度

- 原模块没有测试文件，补充 `src/api.test.ts`，覆盖注册字段、登录字段和应用密码撤销 `204` 空响应契约。
- Vite 页面通过开发服务器返回 `200`，`/health/live` 代理返回 `200`。
- 通过本地 API 代理完成注册、登录、存储状态读取、应用密码创建/列表/撤销验收；撤销返回 `204`，测试账户已按精确 UUID 清理。
- `admin-web` 没有浏览器运行环境，无法执行真实点击级 E2E；Chrome、Edge、Firefox 交互验收需后续在浏览器环境补做。
- 安全页面的账户删除按钮当前仅为展示控件，未将账户删除标记为本次通过项。

### 验证

- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：3 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。
- 开发服务器页面和 API 代理黑盒检查：通过。
