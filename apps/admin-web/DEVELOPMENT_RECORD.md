# 管理后台开发记录

## 2026-08-27：`admin-category-layout-overflow`

### 任务

修复分类管理页面右侧模块被最小列宽推出视口的问题，确保左右工作区完整显示。

### 进度

- 统一分类工作区为左侧书签列表、右侧组织树的完整两列布局。
- 移除导致第二列超出视口的固定最小宽度约束。
- 保留左右模块独立滚动，避免大量书签撑高页面。

### 验证

- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：13 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。

## 2026-08-27：`admin-category-scroll-containers`

### 任务

限制分类管理工作区高度，为书签列表和横向组织树提供独立滚动区域。

### 进度

- 将左右模块限制在视口高度内，避免大量书签把页面无限撑高。
- 左侧书签列表增加独立纵向滚动和固定表头。
- 右侧组织树保留独立横向/纵向滚动，平板布局继续维持左右结构。
- 窄屏场景调整为有限高度的独立滚动容器。

### 验证

- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：13 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。

## 2026-08-26：`admin-category-drag-and-drop`

### 任务

实现分类管理页面，通过左侧递归文件夹组织树和右侧书签列表完成拖拽归类。

### 进度

- 接通分类管理导航，复用真实书签索引和移动 API。
- 增加文件夹展开/折叠、递归书签数量、搜索筛选和拖拽到目标文件夹。
- 保留多选、下拉批量移动作为键盘和触摸设备的替代操作。
- 增加 ETag 并发控制、刷新恢复、加密文件限制提示和响应式布局。

### 验证

- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：13 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。
- `cargo test --manifest-path services/api/Cargo.toml`：18 项通过。

## 2026-08-26：`admin-seven-feature-pages`

### 任务

开发回收站、标签管理、设备管理、偏好设置、导入/导出、帮助中心和关于项目页面，保持 Floccus WebDAV 与客户端加密边界。

### 进度

- 完成七个管理后台页面和响应式交互状态。
- 补充回收站、设备登记/撤销、原始同步文件导入导出 API 与 SQLite 数据模型。
- 修复密文同步文件覆盖明文索引时的残留风险，并允许加密历史版本安全恢复。
- 标签管理按当前协议边界提供能力说明，不伪造未实现的跨设备标签数据。
- 增加偏好设置持久化、帮助 FAQ 搜索、关于页健康状态和 API 契约类型。

### 验证

- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：7 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。
- `cargo test --manifest-path services/api/Cargo.toml`：18 项通过。

## 2026-08-25：`frontend-admin-navigation-icons`

### 任务

统一管理后台侧边导航图标，修复临时 Unicode 字符在不同字体环境下形状不一致的问题。

### 进度

- 将概览、书签、分类、标签、回收站、安全、设置和帮助等导航图标替换为统一线性 SVG。
- 保留现有导航状态、选中态和响应式布局，不改变右侧浏览器侧边栏扩展。

### 验证

- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：3 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。

## 2026-08-25：`frontend-bookmark-management-ui`

### 任务

按产品参考图完成独立的管理后台书签工作区。管理后台与浏览器侧边栏保持两个独立入口，不共享页面状态，也不让后台读取 Floccus 密文中的书签明文。

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
