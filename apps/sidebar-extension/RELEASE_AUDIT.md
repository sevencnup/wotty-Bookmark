# 扩展发布包审计

审计日期：2026-08-25  
审计任务：`release-extension-packaging`  
审计结论：`PASS WITH RELEASE BLOCKERS`

## 产物范围

| 发布目标 | 构建命令 | 产物目录 | Manifest |
| --- | --- | --- | --- |
| Chrome Stable | `pnpm --filter @bookmark-vault/sidebar-extension build` | `.output/chrome-mv3` | MV3 + `side_panel` |
| Edge Stable | 使用 Chrome MV3 产物 | `.output/chrome-mv3` | MV3 + `side_panel` |
| Firefox Stable | `pnpm --filter @bookmark-vault/sidebar-extension build:firefox` | `.output/firefox-mv2` | MV2 + `sidebar_action` |

Edge 使用 Chromium MV3 包，不单独维护第二套入口或同步逻辑。

## 审计结果

| 检查项 | 结果 | 说明 |
| --- | --- | --- |
| 权限最小化 | 通过 | 仅声明 `bookmarks`、`tabs`；Chrome 产物由侧边栏入口生成 `sidePanel`，没有 `host_permissions`、`content_scripts` 或 `web_accessible_resources`。 |
| 权限用途 | 通过 | `bookmarks` 用于读取和修改原生书签；`tabs` 用于读取当前页面并打开用户选择的书签。 |
| 远程代码 | 通过 | 源码没有远程脚本、远程模块、`fetch`、XHR、WebSocket 或 WebDAV 调用；侧边栏不连接云端。构建运行时中的本地资源预加载和框架错误提示不加载远程代码。 |
| 调试日志 | 通过 | 业务源码没有 `console.*` 或 `debugger`。WXT 生成的运行时日志包装器在生产模式不输出，仅保留框架错误处理代码。 |
| 测试脚本 | 通过 | Vitest 测试文件位于源码目录，但 WXT 生产产物仅包含页面、背景脚本、CSS 和构建 chunk，不包含测试文件或测试命令。 |
| 开发地址 | 通过 | 构建产物没有开发服务器地址；`localhost`、`127.0.0.1` 和 HMR 代码未进入生产构建。 |
| Firefox 扩展 ID | 待提交前处理 | 当前 `bookmark-vault-sidebar@example.com` 是稳定占位 ID，提交 Firefox Add-ons 前必须替换为正式唯一 ID，并保持后续版本不变。 |
| Chrome/Edge 扩展 ID | 符合发布流程 | Chrome Web Store 和 Edge Add-ons 会在首次提交后分配商店 ID；当前源码没有伪造或绑定开发 ID。 |
| 商店元数据 | 待补齐 | 已提供 [`STORE_LISTING.md`](STORE_LISTING.md) 文案和权限说明；正式提交前仍需补齐图标、截图、支持页面和公开隐私政策 URL。 |
| 隐私说明 | 已准备 | [`PRIVACY.md`](PRIVACY.md) 说明本扩展只操作浏览器原生书签，不收集或上传数据；提交前需发布到商店可访问的 HTTPS 地址。 |

## 已验证命令

以下命令在仓库根目录执行，依赖使用根 workspace 的 pnpm 安装结果：

```text
pnpm --filter @bookmark-vault/sidebar-extension typecheck
pnpm --filter @bookmark-vault/sidebar-extension test
pnpm --filter @bookmark-vault/sidebar-extension build
pnpm --filter @bookmark-vault/sidebar-extension build:firefox
```

类型检查、3 项单元测试、Chrome MV3 构建和 Firefox MV2 构建均通过。真实 Chrome、Edge、Firefox 交互回归仍需在安装对应浏览器的环境中执行。

## 提交前清单

- [ ] 将 Firefox `gecko.id` 替换为正式唯一扩展 ID。
- [ ] 添加商店要求尺寸的 PNG 图标和至少一组真实浏览器截图。
- [ ] 将 `PRIVACY.md` 发布到公开 HTTPS 页面，并填入商店资料 URL。
- [ ] 填写支持页面、主页和开发者联系方式。
- [ ] 在干净目录分别打包 Chrome/Edge MV3 和 Firefox MV2，确认压缩包不包含 `.wxt`、`.output`、`node_modules`、测试文件和源代码。
- [ ] 在 Chrome、Edge、Firefox 稳定版加载生产包，回归打开侧边栏、搜索、新增、编辑、移动、删除和拖拽排序。

本次审计不引入 WebDAV、远端同步、远端 UUID 映射或第二份云端书签数据。
