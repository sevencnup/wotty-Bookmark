# 分类管理页面文件夹结构与书签列表视觉重构方案

## 1. 需求背景与目标
用户反馈在管理后台的“分类管理”页面（CategoryManagementPage）中，左侧按文件夹分组的书签列表仍然保持了较老的视觉结构，未与此前侧边栏扩展及现代书签库的统一视觉标准对齐：
1. **文件夹分组行（Group Header）视觉杂乱**：
   - 文件夹标题旁重复显示了灰色副路径（如“根目录 根目录”），造成信息冗余。
   - 展开折叠箭头、文件夹图标、标题及计数徽章排版未达极简精致标准。
2. **书签列表项图标与排版未升级**：
   - 书签仍使用彩底首字母方块占位（`.site-mark`），缺少现代 Favicon 支持。
   - 域名副标题字阶与对比度未同步升级为现代无衬线高对比度字体。
3. **整体交互与视觉一致性**：
   - 与侧边栏及我的书签库极简行模式保持统一的高水准设计语言（干净背景、精致 Hover 交互、现代药丸徽章）。

## 2. 详细技术方案

### 2.1 优化文件夹分组标题行（`BookmarkGroup`）
- **精简文本层级**：移除与文件夹标题完全重复的副路径文本；仅当深层子路径且与标题不同时，以优雅的石板灰提示，避免出现“根目录 根目录”的冗余重复。
- **重构图标与徽章**：
  - 优化折叠切换按钮（`ChevronRight` / `ChevronDown`）与文件夹图标的平滑过渡。
  - 采用极简药丸徽章（`folder-count-badge`）呈现书签数量。
  - 精准对齐 Checkbox、Toggle 按钮、Folder 图标与标题。

### 2.2 升级书签列表项（`BookmarkRow`）
- **引入真实 Favicon 支持**：复用现有的 Favicon 加载与内存缓存机制，优先展示高清网站图标，在无图标时平滑回退到精致的字母标或书签标。
- **优化域名与排版**：域名升级为 `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` 高对比度无衬线字体，字号 12px，行高饱满。

### 2.3 样式细节调优（`styles.css`）
- 重构 `.category-bookmark-group-header`、`.category-bookmark-row`、`.category-group-count`、`.category-bookmark-info` 的间距与阴影。
- 确保拖拽手柄、多选框、打开外部链接按钮在 hover 时有细腻微交互。

## 3. 实施步骤
1. 修改 `apps/admin-web/src/CategoryManagementPage.tsx`：引入 Favicon 组件，精简文件夹行冗余文本，对齐布局。
2. 修改 `apps/admin-web/src/styles.css`：编写现代高质感的文件夹分组与书签行样式。
3. 运行全量单元测试与打包构建。
4. 更新版本记录并执行本地提交。
