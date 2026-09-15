# 全局品牌 Logo 升级为 WebP 高清资产方案

## 1. 需求背景与目标

### 1.1 需求说明
- 用户提供了全新的品牌 Logo 文件 `public/logo.webp`。
- 要求将管理后台（`admin-web`）与侧边栏扩展插件（`sidebar-extension`）中的所有应用 Logo 统一替换为该 `logo.webp` 资产。

### 1.2 影响范围
1. **静态资产分发**：
   - 复制 `public/logo.webp` 至 `apps/admin-web/public/logo.webp`。
   - 复制 `public/logo.webp` 至 `apps/sidebar-extension/public/logo.webp`。
2. **管理后台前端 (`apps/admin-web`)**：
   - 更新 `apps/admin-web/src/App.tsx` 中 `BrandLogo` 组件的默认图片路径为 `/logo.webp`。
3. **侧边栏扩展插件 (`apps/sidebar-extension`)**：
   - 更新 `apps/sidebar-extension/src/App.tsx` 顶部栏的 Logo 图片源路径为 `/logo.webp`。
   - 更新 `apps/sidebar-extension/wxt.config.ts` 中的扩展清单图标（`manifest.action.default_icon` 和 `manifest.icons`）指向 `logo.webp`。
4. **验证与交付**：
   - 运行项目全量单元测试与类型检查。
   - 执行管理后台与侧边栏扩展生产构建。
   - 更新版本记录并执行本地提交。

## 2. 实施步骤

1. 将 `public/logo.webp` 复制到 `apps/admin-web/public/logo.webp` 和 `apps/sidebar-extension/public/logo.webp`。
2. 修改 `apps/admin-web/src/App.tsx` 中的 `BrandLogo` 默认 `src` 为 `/logo.webp`。
3. 修改 `apps/sidebar-extension/src/App.tsx` 中的 `<img ... src="/logo.webp" />`。
4. 修改 `apps/sidebar-extension/wxt.config.ts` 中的 `icons` 与 `default_icon` 配置。
5. 运行 `pnpm test`、`pnpm build:admin`、`pnpm build:sidebar` 验证构建。
6. 更新根目录与各应用 `VERSION_RECORD.md`，执行本地 Git 提交。
