# 修复分类管理服务器书签组织架构树纯 CSS 分支连线显示方案

## 1. 问题定位与原因分析

### 1.1 现象
- 在分类管理页面中，服务器书签组织架构树的文件夹分支连线缺失（或仅显示孤立垂直线，无水平支线与子分支连线）。

### 1.2 根因分析
- `apps/admin-web/src/styles.css` 文件底部（约 3690~3711 行）存在历史残留的覆盖样式：
  ```css
  .category-management-page .organization-root-rail-line,
  .category-management-page .organization-root-rail::before,
  .category-management-page .organization-root-rail > .organization-node::before,
  .category-management-page .organization-node > .organization-children::before,
  .category-management-page .organization-node > .organization-children::after,
  .category-management-page .organization-children > .organization-node::before,
  .category-management-page .organization-folder-row::before {
    display: none !important;
    content: none !important;
  }
  ```
- 此外，该区块还将 `.organization-node > .organization-children` 强制设置了 `margin-left: 58px !important;`，覆盖并破坏了组织架构树的几何导轨布局。

## 2. 解决方案

1. **清理冲突与覆盖样式**：
   - 彻底移除 `apps/admin-web/src/styles.css` 底部对组织架构树连线伪元素的 `display: none !important;` 与错误 `margin-left` 覆盖。
2. **规范纯 CSS 树状导轨分支几何参数**：
   - **根节点至主导轨**：根卡片高度约 64px~72px，水平引线从根卡片垂直居中处（`top: 34px`）向右延伸 `48px` 连接到主垂直导轨 `organization-root-rail::after`。
   - **主导轨至顶级文件夹**：顶级节点伪元素 `::before` 提供 `28px` 水平分支线，直接对准文件夹卡片的垂直中心点（`top: 28px`）。
   - **父文件夹至子级导轨**：`organization-children::after` 提供 `36px` 水平引线，连接至子级垂直导轨 `organization-children::before`。
   - **子级导轨至子文件夹**：子节点伪元素 `::before` 提供 `28px` 水平分支线，对齐子文件夹卡片。
3. **验证与回归测试**：
   - 确保各级文件夹展开、折叠、拖拽、多层级嵌套时，连线系统结构完整、清晰、不重叠、无任何卡顿。
   - 运行测试与构建，更新版本记录。
