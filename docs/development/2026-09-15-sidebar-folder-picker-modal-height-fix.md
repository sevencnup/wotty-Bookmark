# 侧边栏弹窗文件夹下拉列表高度溢出与截断修复方案

## 1. 问题现象分析
用户反馈在“新建服务器书签 / 编辑书签 / 移动书签”等弹窗中：
- 点击“保存到”文件夹选择下拉框后，展开的搜索框和文件夹列表被弹窗底部边界截断，无法看到文件夹列表内容。
- 弹窗底部的“取消”和“保存到服务器”按钮被绝对定位的浮层遮挡或溢出视口。

## 2. 根因分析
1. **`.modal-card` 溢出裁切与高度限制**：`.modal-card` 设置了 `overflow: hidden`，导致子元素绝对定位（`position: absolute; top: 100%`）超出卡片底边时直接被裁剪。
2. **侧边栏视口高度有限**：在浏览器侧边栏中，可视高度通常在 400px~600px 之间，弹窗卡片本身有标题、名称输入、网址输入等，加上下拉菜单展开后的 200px+ 空间，导致绝对定位浮层超出弹窗可视范围。
3. **弹窗内部表单布局**：表单 `.editor-form` 没有设置弹性滚动，当内容变多时无法整体滚动。

## 3. 解决方案与优化细节
1. **优化 `modal-card` 与 `editor-form` 弹性滚动布局**：
   - `.modal-card` 设置 `max-height: min(580px, calc(100vh - 24px)); display: flex; flex-direction: column;`。
   - `.editor-form` 设置 `flex: 1; overflow-y: auto; display: flex; flex-direction: column;`，确保在任何视口高度下内容超出均可平滑滚动。
   - 将 `.modal-actions` 固定在表单底部或合理布局，确保操作按钮始终清晰可触达。
2. **表单内文件夹选择器布局优化**：
   - 在弹窗表单中，可搜索文件夹选择器展开时，既支持清晰的搜索与树形列表，又不会被容器裁切。
   - 调整 `.folder-picker-dropdown` 在表单内的定位机制（限制合理最大高度 `max-height: 160px`，列表 `max-height: 120px`，或在 Modal 表单内以流式展开/自适应浮层展示），确保即点即选，且不挡住其他关键元素。
   - 在快速收藏卡片中继续保持优雅的紧凑悬浮层。
3. **视觉细节调优**：
   - 增加展开状态下与下方字段/按钮的合理间距，增强选中与滚动的流畅感。

## 4. 执行步骤
1. 优化 `apps/sidebar-extension/src/styles.css` 中 `.modal-card`、`.editor-form`、`.modal-actions` 及 `.folder-picker` 展开样式。
2. 优化 `apps/sidebar-extension/src/components/FolderPickerDropdown.tsx` 的定位与容器自适应。
3. 运行全量单元测试与打包验证。
4. 更新版本记录并执行本地提交。
