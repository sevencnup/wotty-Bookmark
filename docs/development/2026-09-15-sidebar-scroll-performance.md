# 侧边栏书签插件滚动性能深度优化开发文档

## 1. 现状与瓶颈分析

在书签数量较多（如 1000+ 条）时，侧边栏滑动出现严重卡顿、丢帧。经排查，主要瓶颈如下：
1. **缺乏虚拟列表机制**：所有展开的文件夹和书签一次性全部挂载到 DOM 树中（超过 1 万个 DOM 节点）。
2. **MutationObserver 全局扫雷**：`SidebarUiLocalization` 监听整个 DOM 子树，每个图标异步加载完成改变 DOM 时，都会触发一次全文档级别的 `TreeWalker` 与 `querySelectorAll('*')` 递归扫描。
3. **并发 Favicon 资源请求风暴**：上千个书签同时在 `useEffect` 中发起图标缓存查询、DOMParser 解析与网络请求，占满主线程与 I/O 队列。
4. **CSS 图层合成与过滤开销**：常驻在滚动区域上方的 `backdrop-filter: blur(8px)`（回到顶部按钮）在每一次滚动帧都强制触发合成器背景重采样与重绘。

---

## 2. 优化方案与设计

### 2.1 引入虚拟滚动 (Virtual Scrolling)
- 引入与管理后台一致的高性能虚拟滚动逻辑（`getVirtualWindow`）。
- 对主书签列表和搜索结果列表均采用按需视口渲染（仅渲染视口可见的 15~25 行，外层使用前后 padding 或 absolute 定位撑开总高度）。
- 无论用户有 100 条还是 10,000 条书签，DOM 节点数量始终稳定在 30 个以内。

### 2.2 防抖/细粒度 MutationObserver
- 在 `sidebar-i18n.tsx` 中增加 `requestAnimationFrame` 防抖机制，避免在并发 DOM 变动时进行密集的全局递归遍历。
- 排除 favicon 等已知无需翻译的动态图片和用户自定义节点。

### 2.3 Favicon 并发与视口感知
- 配合虚拟列表后，只有可见视口内的书签才会触发 `Favicon` 加载，天然削减 98% 以上的并发请求。

### 2.4 CSS 滚动合成优化
- 移除悬浮层昂贵的 `backdrop-filter: blur`，使用平滑纯色/轻微投影代替。
- 为滚动容器与书签列表添加 `contain: layout paint` 与 `content-visibility: auto`，隔离局部重排重绘。

---

## 3. 实施步骤

1. **Step 1: 新增侧边栏虚拟列表工具库 (`apps/sidebar-extension/src/lib/virtual-list.ts`)**
2. **Step 2: 改造 `App.tsx` 接入虚拟滚动**
   - 监听 `.workspace` 滚动事件，动态计算视口范围。
   - 对书签列表和搜索结果列表只渲染切片内容。
3. **Step 3: 优化 `sidebar-i18n.tsx` 中的 MutationObserver**
   - 增加防抖或微任务批量处理。
4. **Step 4: 优化 `apps/sidebar-extension/src/styles.css` 的渲染开销**
5. **Step 5: 构建、测试并记录版本**
