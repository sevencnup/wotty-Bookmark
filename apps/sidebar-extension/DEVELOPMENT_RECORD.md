# 书签侧边栏开发记录

## 2026-08-25

- 完成 `frontend-sidebar` 任务的 WXT 构建流程整理。
- 修复了 WXT 生成配置目录在构建后被清理，导致类型检查和测试无法直接运行的问题。
- 增加 Firefox 专用构建命令，并确认 Firefox 产物使用 `sidebar_action`。
- 为 Firefox 发布配置稳定扩展 ID 和数据收集声明。
- 已验证类型检查、单元测试、Chrome MV3 构建和 Firefox MV2 构建。

### 后续衔接

- 在真实 Chrome、Edge 和 Firefox 中加载生产包，完成侧边栏交互回归。
- 继续验证书签拖拽、搜索、编辑和删除等原生书签操作。
- 发布前补充商店图标、截图、隐私政策和商店描述。

## 2026-08-25：`release-extension-packaging`

- 完成 Chrome/Edge MV3 与 Firefox MV2 生产包的权限、远程代码、调试日志、测试脚本和开发地址审计。
- 补充扩展发布审计、隐私说明和三浏览器商店资料草案。
- 确认当前没有云端同步逻辑、WebDAV 调用或远程代码；记录正式提交前的扩展 ID、图标、截图和公开隐私政策 URL 待办。
- 复核类型检查、单元测试、Chrome MV3 构建和 Firefox MV2 构建均通过。
