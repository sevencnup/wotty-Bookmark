# 文件夹极简行模式视觉重构开发文档

## 1. 需求背景与目标

当前后台分类管理页面与侧边栏插件的文件夹采用大面积淡蓝渐变卡片背景、高饱和度蓝色边框及胶囊徽章，层级堆叠时视觉厚重、杂乱。
本次重构将文件夹视觉设计全面切换为**极简行模式（Minimal Row Mode）**，去除厚重卡片背景，降低视觉负担，提升层级辨识度与现代精致感。

---

## 2. 改造范围与设计规范

### 2.1 侧边栏插件 (`apps/sidebar-extension/src/styles.css`)
- **文件夹行 (`.bookmark-folder-row`)**：
  - 移除厚重蓝色渐变背景与发光投影，默认背景透明或极淡底色。
  - 移除厚重外框，改为细致边框或柔和底线；悬浮时提供轻盈优雅的浅灰高亮 (`#f1f5f9`)。
  - 统一行高（由 50px 优化为 38px~40px 紧凑节奏），与整体书签列表自然融合。
- **文件夹图标 (`.folder-icon-card`, `.node-icon.folder-color`)**：
  - 移除多余的方块白底卡片容器，精简化图标展示。
  - 文件夹图标采用经典暖金/琥珀色（如 `#f59e0b` / `#d97706`）或与主题呼应的精致色彩，增强文件夹与网址书签的区分度。
- **计数徽章 (`.folder-count-badge`)**：
  - 移除深蓝描边实心胶囊，改为精致轻量的浅灰微标签 (`color: #64748b; background: #f1f5f9`)，数字阅读清晰且不抢主标题视觉。

### 2.2 管理后台分类管理 (`apps/admin-web/src/styles.css`)
- **左侧分类分组头 (`.category-bookmark-group-header`)**：
  - 去除厚重色块，对齐侧边栏极简行风格。
  - 文件夹图标与计数样式与侧边栏保持一致。
- **右侧组织树节点 (`.organization-folder-row`, `.organization-root-card`)**：
  - 优化树节点背景与边框，采用干净素雅的微质感边框，移除突兀的大面积深浅蓝色块。
  - 保留拖拽放置高亮、选中态、折叠展开动效。

---

## 3. 执行步骤

1. **Step 1: 修改侧边栏样式**
   - 优化 `apps/sidebar-extension/src/styles.css` 中 `.bookmark-folder-row`、`.folder-icon-card`、`.folder-count-badge` 等样式。
2. **Step 2: 修改管理后台分类管理样式**
   - 优化 `apps/admin-web/src/styles.css` 中分类管理分组头与树节点的配色、图标与计数器。
3. **Step 3: 视觉验证与检查**
   - 验证展开/折叠、拖拽手柄、多层级缩进和 hover 状态下视觉一致性。
4. **Step 4: 更新版本记录并本地提交**
   - 更新 `VERSION_RECORD.md`。
   - 执行 git commit。
