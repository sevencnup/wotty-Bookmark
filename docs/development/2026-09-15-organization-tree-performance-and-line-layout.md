# 服务器书签组织架构树性能与连线布局彻底重构方案

## 1. 现象与根因分析

### 1.1 现象
- 在分类管理页面的右侧“服务器书签组织架构”树中，当文件夹数量较多时，界面发生剧烈卡顿。
- 组织树左侧出现大片密密麻麻的浅蓝色线条重叠挤压（条形码式扎堆），严重破坏可读性。

### 1.2 根因分析
1. **强制同步重排风暴（Layout Thrashing）**：
   - 现有代码在 `useLayoutEffect` 和 `ResizeObserver` 中调用 `drawTreeConnections()`。
   - `drawTreeConnections()` 对画布内所有 `[data-tree-node-id]` 和 `[data-tree-parent-id]` 循环调用 `getBoundingClientRect()`。
   - 每次节点展开、折叠、缩放、拖拽移动，都会在单帧内触发数十上百次 DOM 同步强制重排，导致主线程瞬间冻结卡死。
2. **动态 SVG 贝塞尔连线坐标退化**：
   - 顶级文件夹的父节点统一为 `root`（“全部书签”卡片），当有数十个顶级文件夹时，所有曲线从 `root` 右侧强行弯折向各个文件夹左侧，坐标重叠，连线完全糊成一片。
   - `TreeConnectionLayer` 每次计算生成大量 SVG path，触发二次重新渲染。

## 2. 解决方案：纯 CSS 高性能组织架构树（Pure CSS Organization Tree Hierarchy）

### 2.1 彻底移除 JS 驱动的 SVG 几何计算
- 移除 `TreeConnectionLayer`、`drawTreeConnections`、`getBoundingClientRect` 遍历与相关 `useLayoutEffect` / `ResizeObserver`。
- 消除所有强制同步重排，将连线计算成本降为 **0 ms**。

### 2.2 构建现代清晰的纯 CSS 树形连接分支
- 根节点 `root` 采用居中向下发射的主干连接线。
- 顶级文件夹轨道采用清晰的水平总线分布。
- 子文件夹层级采用标准的树形分支线（垂直导轨 + 水平拐角支线），精准定位到各个子文件夹，永不交错重叠。
- 保持平滑缩放 `treeZoom`、拖拽高亮、展开/折叠、选中等全部功能。

## 3. 实施步骤
1. 在 `apps/admin-web/src/CategoryManagementPage.tsx` 中移除 `drawTreeConnections` 和 `TreeConnectionLayer`。
2. 在 `apps/admin-web/src/styles.css` 中重构组织架构树的树形连接导轨与分支线样式。
3. 运行全量单元测试与前端构建。
4. 更新版本记录并执行本地提交。
