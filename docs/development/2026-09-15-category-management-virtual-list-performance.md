# 分类管理页面全部书签虚拟列表与性能极致优化方案

## 1. 现象与根因分析
- **现象**：在分类管理页面中，点击“全部书签”（包含 1000+ 个书签）时，页面加载和交互极其卡顿。
- **根因分析**：
  1. **无虚拟滚动，全量 DOM 挂载**：1000+ 个书签行及其分组头全量渲染到 DOM 中，导致巨大的 DOM 树与重排开销。
  2. **并发 Favicon 探测风暴**：1000+ 个书签同时 mount 并执行 `LibrarySiteIcon` 的图标加载探测 `useEffect`，并发数百个网络请求和异步状态变更，堵塞 JavaScript 事件循环。
  3. **选择状态与拖拽涂抹遍历开销**：全量 DOM 监听 `onMouseDown` / `onMouseOver` 导致频繁样式与类名切换。

## 2. 详细技术方案

### 2.1 扁平化分组虚拟列表（Flattened Grouped Virtual List）
- 将当前可见的分组与书签展开项转换为统一的渲染列表数据流：
  ```ts
  type VirtualRowItem = 
    | { kind: 'group'; id: string; group: BookmarkGroup; depth: number }
    | { kind: 'bookmark'; id: string; bookmark: BookmarkItem; groupId: string };
  ```
- 计算每项高度：
  - 分组头 `GROUP_HEADER_HEIGHT = 42px`
  - 书签行 `BOOKMARK_ROW_HEIGHT = 54px`
- 基于 `getVariableVirtualWindow(itemHeights, scrollTop, viewportHeight, overscan = 8)` 实现精准的可变高度虚拟视口切片。
- 无论拥有 1000 还是 10000 条书签，DOM 节点数量恒定在 20~30 个，内存占用极低，瞬间完成渲染。

### 2.2 Favicon 按需视口加载
- 依托虚拟滚动，仅视口内渲染的 ~15 个书签行会触发 Favicon 加载与渲染，彻底终结网络与事件风暴。

### 2.3 状态与操作完整保留
- 完整保留多选涂抹、单项勾选、组全选、拖拽移动、展开/收起全部、单组折叠等所有交互。

## 3. 执行步骤
1. 在 `apps/admin-web/src/CategoryManagementPage.tsx` 中引入 `getVariableVirtualWindow` 并重构为分组虚拟列表。
2. 优化容器样式确保 `virtual-viewport` 滚动与布局平滑。
3. 运行全量单元测试与打包构建。
4. 更新版本记录并执行本地 Git 提交。
