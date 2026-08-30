# Floccus 加密同步的服务端管理方案

## 目标

保留 Floccus WebDAV 账户的 passphrase 加密，同时允许管理后台读取、整理、删除和恢复书签。服务端保存的 `bookmarks.xbel` 始终保持 Floccus 可读取的加密格式；数据库中的书签节点只是可重建索引。

## 已确认的 Floccus 5.10.2 协议

协议来自本机 Edge 扩展 `floccus bookmarks sync 5.10.2` 的 source map：`src/lib/Crypto.ts` 与 `src/lib/adapters/WebDav.ts`。

- 文件 JSON：`{"ciphertext":"...","salt":"..."}`。
- salt：64 个随机字节编码为 128 个小写十六进制字符；PBKDF2 使用的是该十六进制文本的 UTF-8 字节，而不是解码后的 64 字节。
- KDF：PBKDF2-HMAC-SHA256，250000 次，输出 32 字节。
- 加密：AES-256-GCM，16 字节随机 IV，16 字节认证标签。
- `ciphertext`：标准 Base64 编码的 `IV || ciphertext || tag`。
- 明文：UTF-8 XBEL。Floccus 每次写回都会生成新 salt 和 IV。

旧版 AES-CBC 回退格式只用于读取不带 JSON 外壳的历史密文，不属于当前服务端写回目标，本期不生成该格式。

## 安全边界

启用后台解锁后不再是零知识架构：拥有数据库、同步文件和服务器主密钥的管理员能够恢复 Floccus passphrase 并解密书签。界面和文档必须明确说明这一点。

- passphrase 不以明文、哈希或日志形式保存。
- 服务端用独立 256 位主密钥和 AES-256-GCM 对 passphrase 做信封加密。
- 每个用户使用随机 12 字节 nonce，并将用户 ID 和格式版本作为 AAD，防止密文跨用户替换。
- API 永不返回已保存的 passphrase。
- passphrase、派生密钥、解密后的 XBEL 和密文内部字段不得写日志。
- 主密钥优先读取 `BOOKMARK_VAULT_MASTER_KEY`（32 字节标准 Base64）；未配置时在 `DATA_DIR/server-master.key` 自动生成本机密钥。该文件必须与数据库一同备份并限制读取权限。
- 主密钥丢失后，已保存 passphrase 无法恢复；用户可重新输入正确 passphrase 覆盖旧信封。
- Floccus WebDAV `password` 与加密 `passphrase` 是两个独立字段：前者只用于 HTTP Basic 登录，后者才用于加解密同步文件；管理后台必须明确区分。
- Floccus 新建 WebDAV 配置时 `passphrase` 默认为空，不会自动开启加密。删除配置并重建后，旧密文仍只能由生成它的旧 passphrase 解密。

## 数据与 API

新增 `floccus_secrets`：`user_id`、`key_version`、`nonce`、`encrypted_passphrase`、时间戳。

- `GET /api/v1/storage/encryption`：返回文件是否加密、口令是否已保存、当前是否已解锁，不返回秘密。
- `POST /api/v1/storage/encryption/unlock`：用当前加密文件验证 passphrase；成功后保存加密信封并重建索引。
- `DELETE /api/v1/storage/encryption/passphrase`：删除信封；若当前文件加密，同时清除可搜索索引，但保留同步文件与历史版本。

## 文件状态机

1. 明文 XBEL：直接解析、索引和写回明文，保持兼容。
2. 加密文件且 passphrase 可用：解密、校验 XBEL 和 Floccus ID、更新索引；后台修改后以新 salt/IV 重加密写回。
3. 加密文件但未保存 passphrase：保留原文件，清空旧索引，状态为 `encrypted`。
4. 加密文件与已保存 passphrase 不匹配：保留新文件，清空旧索引，状态为 `encrypted`，要求重新解锁。
5. 历史版本恢复和导入：走同一解析流程，避免恢复后展示旧索引。

WebDAV 的锁、临时文件 MOVE、历史快照、ETag 和版本号语义保持不变。后台修改必须先检查锁和预期 ETag。

## 实施顺序

1. 增加主密钥加载、passphrase 信封加密和 Floccus 兼容加解密模块及测试。
2. 增加迁移和解锁 API。
3. 将 PUT、MOVE、导入、历史恢复、状态读取和后台写回统一接入加密文件解析。
4. 更新书签、回收站和分类编辑的可用状态。
5. 增加管理后台解锁、替换和移除口令界面，并更新零知识说明。
6. 完成 Rust、前端 lint/test/build 和真实 Floccus 文件兼容验证。

## 回滚与恢复

- 回滚应用版本不会修改已有 `bookmarks.xbel`，Floccus 仍能使用原 passphrase 解密。
- 删除 `floccus_secrets` 记录只会锁住后台索引，不会删除同步文件。
- 恢复数据库时必须同时恢复同一份主密钥；否则重新输入 Floccus passphrase。
- 任何解密或 XBEL 校验失败都不得用空树覆盖远端文件。
