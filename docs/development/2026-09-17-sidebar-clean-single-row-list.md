# 侧边栏书签列表极简清爽排版重构开发文档

## 背景

当前侧边栏书签列表中，每个书签项强行占用两行空间（第二行展示域名），行间存在生硬的实线横格分割线，行高（文件夹 38px，书签 52px）不统一且偏高，导致侧边栏在窄屏下视觉杂乱、信息密度低、极度拥挤。

## 目标

重构侧边栏书签项样式与高度，实现与现代浏览器（如 Chrome/Edge 侧边栏）一致的极简清爽树形列表：
1. **单行布局**：书签项与文件夹项统一采用紧凑单行（图标 + 标题），高度收敛至 32px；
2. **轻量纯净视觉**：移除行与行之间的生硬实线分割线，改用悬停时现代圆角浅色背景高亮（Hover Pill）；
3. **URL 优化**：移除书签多余的第二行域名，改为鼠标悬停在标题/行上时的 `title` 原生 Tooltip 提示，保持界面整洁；
4. **统一行高与虚拟列表适配**：将 `BOOKMARK_ROW_HEIGHT` 与 `FOLDER_ROW_HEIGHT` 统一为 32px，同步更新虚拟列表计算与测试；
5. **文件夹徽章与缩进微调**：轻量化文件夹数量角标，优化展开折叠箭头与层级缩进对齐。

## 实施步骤

1. 创建开发文档 `docs/development/2026-09-17-sidebar-clean-single-row-list.md`。
2. 修改 `apps/sidebar-extension/src/App.tsx`：
   - 统一 `FOLDER_ROW_HEIGHT` 与 `BOOKMARK_ROW_HEIGHT` 为 `32`。
   - 在 `NodeRow` 中去除独立渲染的 `.bookmark-url` DOM，并在标题或行上绑定包含 URL 的 `title` 属性。
3. 修改 `apps/sidebar-extension/src/styles.css`：
   - 重构 `.bookmark-list`、`.bookmark-row`、`.bookmark-folder-row`、`.bookmark-item-row`。
   - 移除 `border-bottom` 横线，增加悬停时的圆角微高亮背景。
   - 优化 `.folder-count-badge` 为轻量微标。
   - 精细对齐展开箭头、图标与文字。
4. 修复/更新相关单元测试（如 `virtual-list.test.ts`）。
5. 执行自动化测试与 Chrome 扩展构建，确保无编译报错和回归。
6. 记录版本更新并执行本地 Git 提交。
