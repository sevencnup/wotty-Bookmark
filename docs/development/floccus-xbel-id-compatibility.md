# Floccus XBEL 稳定节点 ID 兼容修复

## 背景

管理后台会从 `bookmark_nodes` 重建 `bookmarks.xbel`。当前重建结果只保留标题、URL 和层级，遗漏 Floccus 5.10.2 用于跨次同步匹配节点的数字 `id`，也遗漏文档级 `highestId` 注释。Floccus 因而把服务端节点解析为 `NaN`，将原有节点误判为大量删除和新增，最终触发 E050 删除保护。

Floccus 5.10.2 本机源码确认的格式为：

```xml
<!--- highestId :8: for Floccus bookmark sync browser extension -->
<folder id="7">
  <bookmark href="https://example.com" id="8"><title>Example</title></bookmark>
</folder>
```

## 目标

- 浏览器上传 XBEL 时保留每个文件夹和书签的 Floccus 数字 ID。
- 后台移动、重命名和删除节点时不改变未删除节点的 Floccus ID。
- 后台恢复或新建节点时分配全局唯一且单调递增的新 ID。
- 后台重建 XBEL 时始终输出有效节点 ID 和不回退的 `highestId`。
- 对已有、没有 Floccus ID 的后台索引完成一次性补号，禁止再次输出无 ID 节点。

## 非目标与恢复边界

- 服务器历史版本表当前没有可用的旧 XBEL 快照，因此无法从服务器还原浏览器原有数字 ID。
- 自动补号只能保证未来生成的 XBEL 合法，不能与 Floccus 现有缓存中的旧 ID 自动对应。
- 修复发布后需要由用户备份书签，再执行一次 Floccus“向上推一次”，让浏览器当前树重建服务器 ID；之后恢复推荐的合并策略。

## 实施步骤

1. 新增数据库迁移：
   - `bookmark_nodes.floccus_id INTEGER`；
   - 每个用户下非空 `floccus_id` 唯一索引；
   - `bookmark_sync_state(user_id, highest_id)` 保存不回退的最高编号。
2. 将 XBEL 模型升级为文档模型，节点携带可选 Floccus ID，文档携带 `highestId`。
3. 解析器读取节点 `id` 与 Floccus `highestId` 注释，拒绝非法或重复数字 ID。
4. 导入索引时：
   - 保存浏览器提供的 ID；
   - 对通用 XBEL 中缺失的 ID 从最高编号之后补号；
   - `highest_id` 取历史状态、文档注释和节点最大 ID 的最大值。
5. 加载索引时为迁移前遗留的空 ID 节点补号，并返回文档级最高编号。
6. 渲染器要求所有节点都有合法 ID，输出 Floccus DOCTYPE、`highestId` 注释和节点 `id` 属性。
7. 回收站恢复在同一数据库事务中申请新 Floccus ID，删除后不回收旧编号。
8. 增加回归测试，覆盖解析/渲染保真、缺失 ID 拒绝渲染、导入补号、移动身份稳定、删除不回退最高编号、恢复分配新编号。
9. 运行 API、管理后台 lint、测试和生产构建，更新开发与版本记录，创建本地提交。

## 安全恢复步骤

1. 修复完成并重启 API 前，不执行 Floccus 普通同步，不关闭删除保护。
2. 导出浏览器书签，并复制服务器当前 `bookmarks.xbel` 备份。
3. 在 Floccus 对该配置执行一次“向上推一次”，以浏览器树覆盖服务器树。
4. 刷新管理后台，确认后台导入了节点 ID。
5. 切回“始终将本地更改与其他浏览器的更改合并（推荐）”。
6. 分别验证浏览器新增、浏览器删除、后台移动、后台删除四条双向链路。
7. 检查 Floccus 日志，服务端树节点应为数字 ID，不再出现 `#NaN`。
