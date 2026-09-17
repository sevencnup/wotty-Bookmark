# 侧边栏品牌英文文案清理开发文档

## 需求

清理侧边栏书签界面中的三处英文展示：

1. 删除“我的服务器书签”上方的 PRIVATE LIBRARY。
2. 移除浏览器顶部显示的英文扩展名称 wotty bookmark sidebar。
3. 将顶部品牌副标题 WOTTY · SERVER LIBRARY 改为小写 wotty · server library。

## 实施步骤

1. 在 `apps/sidebar-extension/src/App.tsx` 删除书签区标题上方的英文眉标。
2. 在 `apps/sidebar-extension/wxt.config.ts` 将必填的扩展清单名称改为中文“书签”，并同步简短名称，避免浏览器顶部继续展示英文扩展名称。
3. 在 `apps/sidebar-extension/src/App.tsx` 将顶部品牌副标题改为小写。
4. 更新扩展清单回归测试，确认英文名称已移除且中文名称保留。
5. 执行侧边栏测试、类型检查和 Chrome 构建。
6. 按项目约定完成本地 Git 提交；不推送 GitHub。

## 验收标准

- 书签区标题上方不再渲染 PRIVATE LIBRARY。
- 扩展清单不再包含 wotty bookmark sidebar，且仍有合法的非空 name。
- 顶部品牌副标题精确显示为 wotty · server library。
- 侧边栏测试、类型检查和生产构建通过。
