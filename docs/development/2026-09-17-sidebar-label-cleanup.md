# 侧边栏品牌英文文案清理开发文档

## 需求

清理侧边栏书签界面中的三处英文展示：

1. 删除“我的服务器书签”上方的 PRIVATE LIBRARY。
2. 保留浏览器顶部的英文扩展名称 wotty bookmark sidebar。
3. 将顶部品牌副标题 WOTTY · SERVER LIBRARY 改为小写 wotty · server library。
4. 将侧边栏页面标题从中文“书签”改为英文扩展名称 wotty bookmark sidebar。

## 实施步骤

1. 在 `apps/sidebar-extension/src/App.tsx` 删除书签区标题上方的英文眉标。
2. 在 `apps/sidebar-extension/wxt.config.ts` 保留英文扩展清单名称 `wotty bookmark sidebar` 与短名称 `Bookmarks`。
3. 在 `apps/sidebar-extension/src/App.tsx` 将顶部品牌副标题改为小写。
4. 在 `apps/sidebar-extension/entrypoints/sidepanel/index.html` 将页面标题改为英文，并更新回归测试。
5. 执行侧边栏测试、类型检查和 Chrome 构建。
6. 按项目约定完成本地 Git 提交；不推送 GitHub。

## 验收标准

- 书签区标题上方不再渲染 PRIVATE LIBRARY。
- 扩展清单包含英文名称 wotty bookmark sidebar，且短名称为 Bookmarks。
- 顶部品牌副标题精确显示为 wotty · server library。
- 侧边栏测试、类型检查和生产构建通过。
