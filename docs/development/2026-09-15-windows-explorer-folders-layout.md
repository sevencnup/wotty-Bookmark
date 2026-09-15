# Windows 资源管理器风格文件夹列表与 26 字母排序方案

## 1. 需求与设计目标
1. **替换横向思维导图/树状展开**：将分类管理页面右侧的文件夹视图改为类似 **Windows 资源管理器 / 文件列表** 的垂直经典列表/网格布局。
2. **26 字母智能拼音/英文排序 (A-Z)**：
   - 顶级文件夹或当前层级文件夹按中文拼音 / 英文 26 字母自然字母序排序 (`Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' })`)。
   - 子文件夹内部同样遵循 A-Z 字母排序。
3. **Windows 资源管理器风格视觉与交互**：
   - **顶部面包屑导航条（Breadcrumb Path Bar）**：如 `全部书签 > 常用工具 > 开发`，点击任意上级节点快速返回；提供“返回上一级”或回到根目录快捷按钮。
   - **文件夹内容视图（Explorer File View）**：
     - 经典双击/单击进入文件夹，清晰显示黄色 Windows 风格文件夹图标、名称、书签数量与子文件夹数量。
     - 支持快捷创建新文件夹/排序切换。
     - 依然支持书签拖拽归类与文件夹拖拽嵌套（拖入文件夹卡片直接移入）。
4. **性能保障**：单层平铺或树形垂直嵌套渲染，0 DOM 重排，绝对流畅 120 FPS。

## 2. 实施步骤
1. 编写开发设计文档。
2. 在 `apps/admin-web/src/CategoryManagementPage.tsx` 中实现：
   - 递归字母排序函数 `sortFoldersAlphabetically`（使用 `Intl.Collator` 支持中英文首字母 A-Z）。
   - 面包屑导航与当前打开的文件夹视图栈（或 Windows 经典的展开目录树 + 右侧文件夹网格）。
3. 在 `apps/admin-web/src/styles.css` 中添加 Windows 资源管理器设计风格。
4. 运行完整测试与构建（`pnpm test && pnpm build:admin && pnpm build:sidebar`）。
5. 记录版本记录并执行本地提交。
