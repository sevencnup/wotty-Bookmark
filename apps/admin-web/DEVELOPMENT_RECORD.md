# 管理后台开发记录

## 2026-09-13：完善 Floccus 配置向导响应式布局


- 中等宽度下配置字段标签、值和复制按钮可随容器收缩。
- 窄屏下改为标签独占一行，长地址可换行显示。
## 2026-09-13：统一书签库迁移卡片高度

- 迁移卡片和 XBEL 导入卡片共享网格行高，内容与底部按钮保持一致。
- 响应式单列布局下不强制拉伸卡片高度。

## 2026-09-12：刷新后恢复管理后台当前页面

- 侧边栏导航独立持久化当前页面，页面 ID 无效时安全回退。

## 2026-09-12：收敛服务器书签库搜索框焦点样式

- 仅调整“我的书签库”搜索栏的焦点样式，不改变其他页面表单反馈。

## 2026-09-12：明确服务器 Logo 缓存目录状态

- 服务器端 favicon 缓存目录由 API 启动时初始化，便于本地开发检查缓存是否启用。

## 2026-09-12：修复服务器书签库 Logo 回退

- 服务端结果缺失或加载失败时，书签列表会尝试站点常见 favicon 路径和公共图标服务。
- 成功的浏览器端图标地址按网站 origin 缓存，后续访问可直接复用。
- 保留首字母最终兜底，并完成测试、类型检查和生产构建验证。

## 2026-09-12：修复服务器书签库 Logo 稳定加载

- 候选 Logo 使用隐藏 Image 预加载，加载期间保持首字母或旧图标。
- 单个候选失败或超时后才切换地址，避免列表出现闪烁。

## 2026-09-12：服务器书签列表虚拟滚动

- “我的服务器书签库”仅渲染当前视口附近的固定行，保留总滚动高度和连续定位。
- 大量书签下减少 DOM、事件和布局计算，搜索结果与原有操作行为保持不变。

## 2026-09-12：服务端批量解析并缓存网站 Logo

- “我的服务器书签库”改为按唯一域名批量调用 favicon API，解析结果在服务端缓存后复用。
- 小图标直接以内联数据返回，较大图标通过鉴权同源缓存地址读取，减少额外请求。
- 搜索筛选不再重复触发图标解析，图标失败时保留域名首字母占位。

## 2026-09-12：修复服务器书签网站 Logo 缺失

- 书签列表不再只请求固定的 `/favicon.ico`，改为依次尝试站点常见图标路径、DuckDuckGo 和 Google 图标服务。
- 图标全部失败时继续显示域名首字母，不影响列表布局和操作。
- 完成 admin-web 测试、类型检查和生产构建验证。

## 2026-09-12：优化服务器书签库展示模块

- 重构“我的书签库”列表行，增加网站图标、域名层级、完整网址、文件夹标签和打开入口。
- 优化长标题截断、搜索状态、删除操作反馈与窄屏响应式布局。
- 完成 admin-web 测试、类型检查和生产构建验证。

## 2026-09-12：修复局域网复制兼容性

- 修复 HTTP 局域网访问时 Clipboard API 被浏览器禁用导致设备码和 API 地址无法复制的问题。
- 复制按钮现在提供兼容回退，并在失败时显示明确状态。

## 2026-09-12：自有服务器书签库

- 新增“我的书签库”导航与独立管理工作区，明确与 Floccus 同步库和浏览器原生书签隔离。
- 支持直接创建、检索、删除、恢复、复制已有同步索引和导入 XBEL 文件。
- 完成 API 契约测试、类型检查与生产构建验证。

## 2026-09-11：补齐服务器备份下载与还原闭环

- 最近备份支持下载归档和确认还原。
- 页面明确整份服务器数据覆盖范围及还原后的重启要求。

## 2026-09-11：移除未实现的标签管理入口

- 侧边栏不再展示当前同步协议无法支持的标签管理页面。
- 清理标签占位页、导航路由和相关样式，并将历史默认页设置回退到概览。

## 2026-08-30：Floccus 第四步生成入口

- 在 Encryption Passphrase 步骤内增加“生成并填入专用密码”按钮。
- 生成后同时填充 WebDAV Password 与 Encryption Passphrase，避免用户返回第一步查找入口。

## 2026-08-30：floccus-single-credential-setup

### 任务

消除应用密码与 Passphrase 双重概念造成的新手配置错误。

### 进度

- 配置向导改为一次创建“Floccus 专用密码”。
- WebDAV Password 与 Encryption Passphrase 两处明确展示并复制同一串值。
- 服务端自动保存受保护的解密信息，首次同步后无需在分类管理二次验证。
- 分类页和帮助中心兼容说明旧配置仍需使用原 Passphrase。

### 验证

- 后端覆盖同一秘密双用途与事务回滚。
- 管理后台 API 契约、类型检查、测试和生产构建通过。

## 2026-08-30：`floccus-passphrase-recovery`

### 任务

修复 Floccus 应用密码与加密 Passphrase 混淆，并为遗失旧 Passphrase 的情况提供安全重建。

### 进度

- 解锁页明确说明必须填写 Floccus 加密 Passphrase，而不是 WebDAV 应用密码。
- 加密状态可将旧密文保存到历史版本后移除远端基线和服务器旧口令。
- 配置向导更新为当前服务端解锁能力，删除“加密后后台无法读取”的过期说明。
- 错误信息区分认证失败、密文格式损坏与解密后 XBEL 无法解析。

### 验证

- API 加密错误分类与基线重建测试通过。
- 管理后台类型检查、测试和生产构建通过。

## 2026-08-30：`floccus-encrypted-admin-management`

### 任务

保留 Floccus 加密，同时允许管理后台整理、删除和恢复书签。

### 进度

- 书签管理和分类管理增加 passphrase 验证与解锁界面。
- 明确提示启用后台解锁后不再是零知识加密。
- 支持移除服务器保存的受保护 passphrase，保留原加密同步文件。
- 回收站、导入导出、安全说明和帮助文档同步更新加密边界。

### 验证

- 管理后台类型检查、20 项测试和生产构建通过。
- API 32 项测试通过，包括 Floccus WebCrypto 固定向量与加密写回链路。

## 2026-08-30：`floccus-encrypted-to-plaintext`

### 任务

修复直接关闭 Floccus 加密后远端密文无法按 XBEL 读取的 E034。

### 进度

- 从 Floccus 日志确认 E034 来自缺少 passphrase 或远端格式不匹配。
- 核对服务器正式同步文件仍为包含 `ciphertext` 与 `salt` 的加密 JSON。
- 加密状态页面增加“备份并切换为明文同步”操作。
- 操作复用历史版本和同步锁保护，先保存旧密文，再移除远端基线。
- 页面明确要求操作成功后关闭加密并执行一次“向上推一次”。

### 验证

- 管理后台类型检查、19 项测试和生产构建通过。

## 2026-08-30：`floccus-revoked-lock-takeover`

### 任务

修复删除旧 Floccus 配置并重建后，新应用密码被旧配置遗留锁阻塞的问题。

### 进度

- 对照日志、锁文件和数据库确认旧锁所有者应用密码已撤销。
- WebDAV 加锁时校验所有者状态，已撤销、过期或不存在的凭据锁立即失效。
- 新有效应用密码可以直接替换失效锁，不再固定等待 15 分钟。
- 其他仍有效应用密码持有的锁继续阻止并发操作。

### 验证

- 新增撤销凭据遗留锁立即接管测试。
- 修正活跃锁测试以使用真实未撤销应用密码。
- `cargo test --manifest-path services/api/Cargo.toml`：28 项通过。

## 2026-08-30：`floccus-concurrent-lock-race`

### 任务

修复 Floccus 新配置在强制同步启动阶段并发重复加锁导致的 E037。

### 进度

- 从日志确认两次 `onSyncStart` 仅间隔 5 毫秒。
- 修复锁文件创建后、所有者标记尚未写完时被并发请求读取的窗口。
- 使用完整临时锁标记原子发布正式锁，同一所有者并发重入可继续同步。
- 保持不同应用密码之间的 423 锁隔离。

### 验证

- 新增同一所有者并发加锁回归测试。
- `cargo test --manifest-path services/api/Cargo.toml`：27 项通过。

## 2026-08-29：`floccus-fast-recovery`

### 任务

优化旧 XBEL 缺少 Floccus 节点 ID 时的首次恢复同步速度。

### 进度

- 迁移提示增加“备份并快速重建同步文件”操作和二次确认。
- 后端先保存旧文件历史版本，再移除当前基线和失效索引。
- 活跃 Floccus 锁阻止重建，重建自身也持有独占锁避免并发写入。
- 当前同步状态按正式 XBEL 的实际存在情况计算，历史版本仍可恢复。
- 重建后保留现有 Floccus 配置，只需执行一次“向上推一次”。

### 验证

- `cargo test --manifest-path services/api/Cargo.toml`：26 项通过。
- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：19 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。

## 2026-08-29：`floccus-lock-reentry`

### 任务

修复 Floccus 在旧 XBEL 映射恢复过程中自动重启强制同步时触发 E037 的问题。

### 进度

- 通过 Floccus 完整日志确认两次加锁请求间隔 9 毫秒且使用同一应用密码身份。
- WebDAV 锁允许同一所有者重复获取并刷新修改时间，不同所有者继续返回 423。
- 保留当前锁文件兼容，不要求用户手工删除锁。

### 验证

- 新增同一所有者重复加锁成功、不同所有者加锁失败的回归测试。
- `cargo test --manifest-path services/api/Cargo.toml`：24 项通过。

## 2026-08-29：`floccus-xbel-stable-node-ids`

### 任务

修复管理后台重写 XBEL 后丢失 Floccus 节点 ID、导致 E050 大量删除保护的问题。

### 进度

- 从本机 Floccus 5.10.2 源码确认节点 `id` 属性和 `highestId` 注释格式。
- 数据库持久化 Floccus 节点 ID 与用户级最高编号，后台移动和删除保留原 ID。
- 回收站恢复分配新的单调递增 ID，不复用已删除节点编号。
- XBEL 解析和渲染完整保留身份信息，拒绝重复、非法或缺失身份的后台重写。
- 缺少完整身份的旧文件显示安全迁移提示，并在公共编辑闸门阻止直接 API 修改。
- 服务器没有可恢复的旧明文历史版本，因此修复后需由浏览器执行一次“向上推一次”。

### 验证

- `cargo test --manifest-path services/api/Cargo.toml`：23 项通过。
- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：18 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。

## 2026-08-29：`admin-bookmark-batch-trash`

### 任务

在分类管理页面增加勾选书签后的批量删除能力，并保证删除写入 WebDAV 同步文件。

### 进度

- 批量操作栏增加“删除”危险操作按钮，仅在已选择书签时显示。
- 删除前提示选中数量，并明确下次 Floccus 双向同步可能同步删除浏览器中的对应书签。
- 新增批量移入回收站接口，一次加载书签索引、一次事务处理全部书签、一次重写 XBEL。
- 复用明文 XBEL 状态、文件锁和 ETag 校验，避免覆盖 Floccus 的并发同步结果。
- 删除成功后清空选择、刷新书签树，并保留管理后台回收站恢复能力。

### 验证

- `cargo test --manifest-path services/api/Cargo.toml`：21 项通过。
- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：18 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。

## 2026-08-29：`admin-folder-subtree-drag-move`

### 任务

支持在右侧组织树中拖动文件夹，完成整棵文件夹分支的层级调整。

### 进度

- 新增文件夹移动 API，复用登录鉴权、ETag 并发校验、事务更新和 XBEL 文件重写流程。
- 文件夹可拖入其他文件夹，内部子文件夹与书签随父文件夹整体移动。
- “全部书签”根卡片可接收文件夹，将嵌套文件夹移回顶级目录。
- 前后端同时阻止移动到自身或子孙文件夹，并禁止拖回当前父级的无效操作。
- 增加来源、合法目标和禁止目标的拖动反馈，折叠目标停留后自动展开。
- 移动成功后刷新树数据，已有 SVG 曲线连接层按新节点坐标自动重绘。

### 验证

- `cargo test --manifest-path services/api/Cargo.toml`：20 项通过。
- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：18 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。
- 独立 Chromium 可打开管理后台；因不复用用户登录态，未对真实书签执行移动操作。
- 临时浏览器与验证脚本已清理，未停止用户现有开发服务。

## 2026-08-29：`admin-category-interaction-polish`

### 任务

完善分类管理的批量选择、文件夹层级、组织树连线和搜索框焦点视觉。

### 进度

- 移除文件夹目录带的左侧颜色标注，改为四周一致的浅色边框。
- 增加书签行按住滑动连续选择，支持连续选中和连续取消。
- 保持复选框、书签拖拽手柄和外链打开操作独立，避免连续选择误触。
- 将右侧组织树分支接头改为圆角弯曲连接。
- 移除搜索输入框自身的蓝色焦点矩形，只保留外层搜索容器反馈。

### 验证

- Chromium 真实页面连续划过 3 行：三行全部选中；从已选行反向划过后，三行全部取消。
- 文件夹标题左右边框均为 1px 同色边框，不再出现侧边色条。
- 搜索输入聚焦后的 `outline` 与 `box-shadow` 均为 `none`。
- 组织树分支接头使用 14px 圆角和透明背景，形成弯曲连接。
- 补齐父文件夹右侧到子级竖向主干的圆角出线，修复多层分支悬空。
- 统一所有递归层级的父子间距，覆盖旧样式中的顶层 `margin-left: 0` 和深层 `18px` 规则。
- Chromium 几何回归检查覆盖 45 个展开分支：父卡片端压入 2px、子级主干端重叠 2px、断线 0 项。
- 本轮 `lint`、17 项测试与生产构建全部通过，临时会话、验证脚本、截图和隔离浏览器已清理。
- 将组织树连线从递归 CSS 伪元素整体迁移为独立 SVG 连接层。
- 每条可见父子关系使用真实卡片坐标绘制三次贝塞尔曲线，并在展开、收起、缩放和窗口变化后重绘。
- 关闭旧主干、父级出线和子级入线，避免样式覆盖导致断线或重复线条。
- 顶层总目录连接使用更淡的线条，深层父子关系保持清晰。
- Chromium 真实数据验证：展开 274/274、收起 165/165、再次展开 274/274，65% 和 120% 缩放均为 274/274。
- 所有 SVG 曲线起终点与对应父子卡片边缘的坐标误差均在 0.25px 内，非法路径 0 项。
- SVG 重构后的 `lint`、17 项测试和生产构建全部通过，临时资源已清理。
- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：17 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。
- 临时会话、测试脚本、截图和隔离浏览器均已清理。

## 2026-08-29：`admin-category-folder-color`

### 调整

- 文件夹分组标题改为浅蓝目录带，并增加左侧蓝色强调条。
- 展开、收起和悬停状态使用不同深浅，书签内容行继续保持白底。
- 文件夹图标和数量徽标改为白底蓝色，强化文件夹与书签的层级区分。

## 2026-08-29：`admin-category-group-height`

### 任务

修复分类管理文件夹分组滚动后出现顶部半格空白和高度不一致的问题。

### 进度

- 移除文件夹分组标题的 sticky 定位，恢复普通文档流。
- 保留列表列标题 sticky，继续提供滚动表头。
- 增加最终样式覆盖，避免旧样式重新启用 sticky。

### 验证

- 真实 1017 条书签下全部收起并滚动 2400px，连续 10 个分组顶边差值均为 0px。
- 所有抽检分组统一为 53px。
- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：17 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。
- 临时会话、浏览器和测试脚本已清理。

## 2026-08-29：`admin-category-interaction-performance`

### 任务

修复大量书签下分类管理分组收起、展开和打开书签出现约一秒延迟的问题。

### 进度

- 缓存可见书签、文件夹列表和书签分组计算。
- 将书签分组拆为记忆化组件，避免单组操作重渲染全部 1017 条书签。
- 缓存右侧组织树，避免左侧操作重新协调 274 个文件夹节点。
- 使用 `content-visibility` 隔离屏幕外分组的布局与绘制。

### 验证

- Chromium 真实数据基准：单组操作由 688～1316ms 降至 19～53ms。
- 书签链接点击事件约 0.8ms。
- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：17 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。
- 临时会话、数据库副本、浏览器、脚本和调试进程已清理。

## 2026-08-29：`admin-runtime-connection-recovery`

### 任务

处理 API 500、Vite 断连和页面 `Failed to fetch` 的连锁运行时错误。

### 进度

- 将 Fetch 网络失败和 Vite 代理断连转换为明确的中文错误。
- 存储文件、应用密码和分类管理页面增加重新连接入口。
- 联合启动脚本在单个子服务退出后保留另一个服务，并打印退出来源。
- 确认 `sidebar.js getComputedStyle` 来自浏览器扩展注入，不属于管理后台源码。

### 验证

- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：17 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。
- API 健康检查返回 200，未登录受保护接口返回预期 401。
- 调试服务、临时数据库副本和诊断账号已清理。

## 2026-08-29：`admin-bookmark-folder-group-controls`

### 任务

修复文件夹分组控件在新 JSX 与旧 CSS 资源混用时退化为原生按钮、表头竖排的问题。

### 进度

- 分组标题复用组织树已有稳定控件类，增加按钮原生外观重置和最终布局覆盖。
- 锁定分组表头三列、分组栏四列和书签行四列布局，兼容 680px 以下窄屏。

### 验证

- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- Chromium 窄窗口计算样式检查：表头横向三列、折叠按钮 `display: grid`、文件夹按钮 `appearance: none`、原生按钮数量为 0。
- 314px 列表宽度下分组按钮和书签行无横向溢出。
- 临时浏览器与管理后台开发服务已关闭。

## 2026-08-29：`admin-bookmark-folder-groups`

### 任务

将分类管理页面左侧书签列表由平铺展示改为按实际文件夹分类展示。

### 进度

- 根目录、一级目录和嵌套目录分别显示文件夹分组标题、路径与书签数量。
- 增加单组折叠、全部展开/收起和整组选择，并保留搜索、单项选择、批量移动与拖拽归类。
- 右侧总目录卡片支持点击返回全部书签，右侧选择文件夹时左侧继续按实际子目录分组。
- 增加分组工具函数，按组织树顺序输出分组，并保留暂时不存在于树中的文件夹书签。

### 验证

- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：15 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。
- Chromium 分组验收：5 个分组、7 条书签完整展示，折叠状态和 `aria-expanded` 同步正确。
- 314px 列表可用宽度下无横向溢出；临时浏览器会话、截图和开发服务已清理。

## 2026-08-28：`admin-ui-visual-upgrade`

### 任务

升级管理后台整体 UI 视觉，在不改变业务逻辑和数据边界的前提下统一桌面端与移动端体验。

### 进度

- 建立统一的颜色、圆角、阴影、间距和焦点态设计令牌。
- 升级侧边栏导航、账户区、退出入口、页面标题栏和服务状态展示。
- 统一面板、统计卡片、按钮、表单、表格、提示状态和功能页组件。
- 收敛概览页视觉层级，并校准分类管理双栏、内部滚动和移动端回流。
- 保留现有 API、书签操作逻辑、固定桌面应用壳和用户 Logo 资源改动。

### 验证

- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：13 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。
- 开发服务器 `http://127.0.0.1:56993/`：返回 `200`。

## 2026-08-28：`admin-page-state-centering`

### 任务

统一其他后台页面的整页提示状态，使其与分类管理空状态一样在右侧内容区居中。

### 进度

- 为书签整理、回收站和标签页增加明确的整页提示布局状态。
- 将备份、操作日志等待开发页面的提示统一为纵向居中布局。
- 保留应用密码、设备列表、历史版本、帮助搜索和存储摘要中的局部空状态位置。
- 保持移动端自然文档流，避免固定高度裁切内容。

### 验证

- Playwright 整页提示布局检查：4 项通过。
- Playwright 局部空状态位置检查：1 项通过。
- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：13 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。

## 2026-08-28：`admin-category-page-scroll-lock`

### 任务

修复桌面端分类管理页面可以整体滚动、应用壳滑出视口并露出空白区域的问题。

### 进度

- 首轮百分比高度锁定经用户复验仍会发生整页滚动，未作为最终结果。
- 将桌面端应用壳固定到视口四边，并禁止分类页主内容区滚动穿透。
- 保留侧边导航、书签列表和组织树的内部滚动。
- 在窄屏断点恢复静态布局和自然页面滚动，避免移动端内容被裁切。

### 验证

- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：13 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。
- Playwright 桌面端滚轮穿透检查：应用壳、主内容区和左右面板坐标保持不变。
- Playwright 移动端回流检查：固定定位解除，页面保持自然滚动。

## 2026-08-27：`admin-category-left-panel`

### 任务

修复分类管理页面刷新后左侧书签面板消失的问题。

### 进度

- 统一分类页外层容器与双栏布局样式的 class 契约。
- 左侧书签面板固定为第一列，右侧组织树固定为第二列。
- 保留书签列表和组织树各自的内部滚动区域。

### 验证

- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：13 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。
- Playwright 刷新前后布局检查：左右两个面板均持续可见。

## 2026-08-27：`admin-fixed-dev-port`

### 任务

修复开发服务端口漂移导致刷新时打开其他项目或旧实例的问题。

### 进度

- 将 admin-web Vite 开发服务设置为严格使用 56993 端口。
- 同步更新 TypeScript 和生成的 JavaScript Vite 配置。
- 确保分类页面刷新时不会因端口自动递增而切换到其他应用。

### 验证

- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：13 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。

## 2026-08-27：`admin-category-refresh-reflow`

### 任务

修复分类管理页面刷新后右侧模块消失、工作区发生横向偏移的问题。

### 进度

- 移除刷新后会覆盖分类工作区的重复响应式布局规则。
- 固定书签面板和组织树面板的网格列位置与可收缩宽度。
- 禁止工作区自身被内容推出视口，滚动仅发生在两个内部容器。
- 保留左侧书签、右侧组织树和独立滚动条。

### 验证

- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：13 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。

## 2026-08-27：`admin-category-refresh-layout`

### 任务

修复分类管理页面刷新后右侧组织树被布局规则推出视口的问题。

### 进度

- 清理重复的分类工作区响应式覆盖规则。
- 固定左侧书签、右侧组织树的双栏顺序和宽度计算。
- 保留两个模块各自的内部滚动，避免刷新后的 CSS 重排导致右侧区域消失。
- 修复 CSS 末尾多余闭合符，确保构建产物样式解析稳定。

### 验证

- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：13 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。

## 2026-08-27：`admin-category-layout-overflow`

### 任务

修复分类管理页面右侧模块被最小列宽推出视口的问题，确保左右工作区完整显示。

### 进度

- 统一分类工作区为左侧书签列表、右侧组织树的完整两列布局。
- 移除导致第二列超出视口的固定最小宽度约束。
- 保留左右模块独立滚动，避免大量书签撑高页面。

### 验证

- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：13 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。

## 2026-08-27：`admin-category-scroll-containers`

### 任务

限制分类管理工作区高度，为书签列表和横向组织树提供独立滚动区域。

### 进度

- 将左右模块限制在视口高度内，避免大量书签把页面无限撑高。
- 左侧书签列表增加独立纵向滚动和固定表头。
- 右侧组织树保留独立横向/纵向滚动，平板布局继续维持左右结构。
- 窄屏场景调整为有限高度的独立滚动容器。

### 验证

- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：13 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。

## 2026-08-26：`admin-category-drag-and-drop`

### 任务

实现分类管理页面，通过左侧递归文件夹组织树和右侧书签列表完成拖拽归类。

### 进度

- 接通分类管理导航，复用真实书签索引和移动 API。
- 增加文件夹展开/折叠、递归书签数量、搜索筛选和拖拽到目标文件夹。
- 保留多选、下拉批量移动作为键盘和触摸设备的替代操作。
- 增加 ETag 并发控制、刷新恢复、加密文件限制提示和响应式布局。

### 验证

- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：13 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。
- `cargo test --manifest-path services/api/Cargo.toml`：18 项通过。

## 2026-08-26：`admin-seven-feature-pages`

### 任务

开发回收站、标签管理、设备管理、偏好设置、导入/导出、帮助中心和关于项目页面，保持 Floccus WebDAV 与客户端加密边界。

### 进度

- 完成七个管理后台页面和响应式交互状态。
- 补充回收站、设备登记/撤销、原始同步文件导入导出 API 与 SQLite 数据模型。
- 修复密文同步文件覆盖明文索引时的残留风险，并允许加密历史版本安全恢复。
- 标签管理按当前协议边界提供能力说明，不伪造未实现的跨设备标签数据。
- 增加偏好设置持久化、帮助 FAQ 搜索、关于页健康状态和 API 契约类型。

### 验证

- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：7 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。
- `cargo test --manifest-path services/api/Cargo.toml`：18 项通过。

## 2026-08-25：`frontend-admin-navigation-icons`

### 任务

统一管理后台侧边导航图标，修复临时 Unicode 字符在不同字体环境下形状不一致的问题。

### 进度

- 将概览、书签、分类、标签、回收站、安全、设置和帮助等导航图标替换为统一线性 SVG。
- 保留现有导航状态、选中态和响应式布局，不改变右侧浏览器侧边栏扩展。

### 验证

- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：3 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。

## 2026-08-25：`frontend-bookmark-management-ui`

### 任务

按产品参考图完成独立的管理后台书签工作区。管理后台与浏览器侧边栏保持两个独立入口，不共享页面状态，也不让后台读取 Floccus 密文中的书签明文。

### 进度

- 新增截图对应的管理后台布局：侧边导航、书签管理顶部栏、统计卡片、工具栏、列表/网格视图和分页区域。
- 增加搜索、分类筛选、全选、创建、编辑、移入回收站和操作提示等前端交互。
- 保留现有登录、概览、应用密码、Floccus 配置和账户安全页面。
- 书签工作区使用前端本地示例状态承载视觉和交互验收；服务端仍只保存 Floccus 加密数据，后续接入真实书签来源需单独设计 API 边界。
- 复核 `apps/sidebar-extension` 仍为独立浏览器原生书签侧边栏，不接入 WebDAV。

### 验证

- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：3 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。
- `pnpm --filter @bookmark-vault/sidebar-extension typecheck`：通过。
- `pnpm --filter @bookmark-vault/sidebar-extension test`：3 项通过。
- `pnpm --filter @bookmark-vault/sidebar-extension build`：通过。
- `pnpm --filter @bookmark-vault/sidebar-extension build:firefox`：通过。

## 2026-08-25

### 任务

完成 `admin-console-qa`：验收管理后台的构建、页面可达性和注册、登录、存储状态、应用密码管理链路。

### 进度

- 原模块没有测试文件，补充 `src/api.test.ts`，覆盖注册字段、登录字段和应用密码撤销 `204` 空响应契约。
- Vite 页面通过开发服务器返回 `200`，`/health/live` 代理返回 `200`。
- 通过本地 API 代理完成注册、登录、存储状态读取、应用密码创建/列表/撤销验收；撤销返回 `204`，测试账户已按精确 UUID 清理。
- `admin-web` 没有浏览器运行环境，无法执行真实点击级 E2E；Chrome、Edge、Firefox 交互验收需后续在浏览器环境补做。
- 安全页面的账户删除按钮当前仅为展示控件，未将账户删除标记为本次通过项。

### 验证

- `pnpm --filter @bookmark-vault/admin-web lint`：通过。
- `pnpm --filter @bookmark-vault/admin-web test`：3 项通过。
- `pnpm --filter @bookmark-vault/admin-web build`：通过。
- 开发服务器页面和 API 代理黑盒检查：通过。
