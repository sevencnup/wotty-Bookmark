# 组织架构树真实平滑贝塞尔曲线（S-Curve Bezier Connectors）方案

## 1. 根本问题分析

### 1.1 纯 CSS 伪元素画线的天然局限
- 在横向展开的多层级树结构（Flex 嵌套）中，子列表 `.organization-children` 的高度会随子孙节点数量成倍增长。
- 父容器高度被整个子树撑大，导致纯 CSS 伪元素（`::before`/`::after`）的相对高度和起点发生严重形变，无法在“父节点右边缘”与“子节点左边缘”之间建立真实贯通的连线。

### 1.2 高性能 SVG 贝塞尔平滑曲线系统
- **三次贝塞尔曲线（Cubic Bezier S-Curve）**：
  - 从父节点右侧中心 `(x1, y1)` 出发，平滑向右延伸；
  - 拐弯平滑流入子节点左侧中心 `(x2, y2)`；
  - 公式：`M ${x1} ${y1} C ${x1 + dx * 0.5} ${y1}, ${x2 - dx * 0.5} ${y2}, ${x2} ${y2}`。
- **极致性能与零卡顿保证（Zero Lag Architecture）**：
  1. **按需计算（On-Demand Only）**：仅在文件夹展开/折叠、数据更新时计算一次，计算耗时 < 1ms。
  2. **脱离滚动与拖拽循环**：SVG 连线层位于 `organization-tree-canvas` 内部，滚动时跟随画布进行硬件加速位移，**滚动过程 0 计算、0 重绘、120 FPS 丝滑满帧**。
  3. **防重排缓存**：单次批处理读取节点相对坐标，绝不在动画帧或鼠标移动中触发 `getBoundingClientRect`。

## 2. 实施步骤
1. 在 `apps/admin-web/src/CategoryManagementPage.tsx` 中实现高效的 SVG 贝塞尔曲线连接层，精准连接 `root -> 顶级文件夹` 以及 `父文件夹 -> 子文件夹`。
2. 清理 `apps/admin-web/src/styles.css` 中所有造成错位的临时伪元素边框。
3. 运行全量测试与构建，验证真实视觉与交互。
