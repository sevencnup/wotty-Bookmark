# 管理后台开发记录

## 2026-08-28：`admin-ui-visual-upgrade`

### 任务

升级管理后台整体 UI 视觉，在不改变业务逻辑和数据边界的前提下统一桌面端与移动端体验。

### 进度

- 建立统一的颜色、圆角、阴影、间距和焦点态设计令牌。
- 升级侧边栏导航、账户区、退出入口、页面标题栏和服务状态展示。
- 统一面板、统计卡片、按钮、表单、表格、提示状态和功能页组件。
- 收敛概览页视觉层级，并校准分类管理双栏、内部滚动和移动端回流。
- 保留现有 API、书签操作逻辑、固定桌面应用壳和用户 Logo 资源改动。

### 验证

- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：13 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。
- 开发服务器 `http://127.0.0.1:56993/`：返回 `200`。

## 2026-08-28：`admin-page-state-centering`

### 任务

统一其他后台页面的整页提示状态，使其与分类管理空状态一样在右侧内容区居中。

### 进度

- 为书签整理、回收站和标签页增加明确的整页提示布局状态。
- 将备份、操作日志等待开发页面的提示统一为纵向居中布局。
- 保留应用密码、设备列表、历史版本、帮助搜索和存储摘要中的局部空状态位置。
- 保持移动端自然文档流，避免固定高度裁切内容。

### 验证

- Playwright 整页提示布局检查：4 项通过。
- Playwright 局部空状态位置检查：1 项通过。
- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：13 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。

## 2026-08-28：`admin-category-page-scroll-lock`

### 任务

修复桌面端分类管理页面可以整体滚动、应用壳滑出视口并露出空白区域的问题。

### 进度

- 首轮百分比高度锁定经用户复验仍会发生整页滚动，未作为最终结果。
- 将桌面端应用壳固定到视口四边，并禁止分类页主内容区滚动穿透。
- 保留侧边导航、书签列表和组织树的内部滚动。
- 在窄屏断点恢复静态布局和自然页面滚动，避免移动端内容被裁切。

### 验证

- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：13 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。
- Playwright 桌面端滚轮穿透检查：应用壳、主内容区和左右面板坐标保持不变。
- Playwright 移动端回流检查：固定定位解除，页面保持自然滚动。

## 2026-08-27：`admin-category-left-panel`

### 任务

修复分类管理页面刷新后左侧书签面板消失的问题。

### 进度

- 统一分类页外层容器与双栏布局样式的 class 契约。
- 左侧书签面板固定为第一列，右侧组织树固定为第二列。
- 保留书签列表和组织树各自的内部滚动区域。

### 验证

- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：13 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。
- Playwright 刷新前后布局检查：左右两个面板均持续可见。

## 2026-08-27：`admin-fixed-dev-port`

### 任务

修复开发服务端口漂移导致刷新时打开其他项目或旧实例的问题。

### 进度

- 将 admin-web Vite 开发服务设置为严格使用 56993 端口。
- 同步更新 TypeScript 和生成的 JavaScript Vite 配置。
- 确保分类页面刷新时不会因端口自动递增而切换到其他应用。

### 验证

- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：13 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。

## 2026-08-27：`admin-category-refresh-reflow`

### 任务

修复分类管理页面刷新后右侧模块消失、工作区发生横向偏移的问题。

### 进度

- 移除刷新后会覆盖分类工作区的重复响应式布局规则。
- 固定书签面板和组织树面板的网格列位置与可收缩宽度。
- 禁止工作区自身被内容推出视口，滚动仅发生在两个内部容器。
- 保留左侧书签、右侧组织树和独立滚动条。

### 验证

- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：13 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。

## 2026-08-27：`admin-category-refresh-layout`

### 任务

修复分类管理页面刷新后右侧组织树被布局规则推出视口的问题。

### 进度

- 清理重复的分类工作区响应式覆盖规则。
- 固定左侧书签、右侧组织树的双栏顺序和宽度计算。
- 保留两个模块各自的内部滚动，避免刷新后的 CSS 重排导致右侧区域消失。
- 修复 CSS 末尾多余闭合符，确保构建产物样式解析稳定。

### 验证

- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：13 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。

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
