import { createElement, useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'

export type Locale = 'zh-CN' | 'en'

export type TranslationKey =
  | 'appName'
  | 'adminConsole'
  | 'administrator'
  | 'signOut'
  | 'serviceOnline'
  | 'adminWorkspace'
  | 'navOverview'
  | 'navDataManagement'
  | 'navStorage'
  | 'navLibrary'
  | 'navCategories'
  | 'navTrash'
  | 'navSecurityManagement'
  | 'navSidebarConnection'
  | 'navBackup'
  | 'navDevices'
  | 'navSystemSettings'
  | 'navAccount'
  | 'navPreferences'
  | 'navImportExport'
  | 'navHelpSupport'
  | 'navHelp'
  | 'navAbout'
  | 'language'
  | 'languageDescription'
  | 'languageChinese'
  | 'languageEnglish'
  | 'interfaceDensity'
  | 'interfaceDensityDescription'
  | 'densityComfortable'
  | 'densityCompact'
  | 'defaultPage'
  | 'defaultPageDescription'
  | 'reduceMotion'
  | 'reduceMotionDescription'
  | 'confirmDangerousActions'
  | 'confirmDangerousActionsDescription'
  | 'preferencesSecurityNote'
  | 'loginTitle'
  | 'loginDescription'
  | 'emailOrUsername'
  | 'password'
  | 'login'
  | 'createAccount'
  | 'processing'
  | 'noAccountCreate'
  | 'hasAccountLogin'
  | 'loginHint'
  | 'requestFailed'

type TranslationTable = Record<TranslationKey, string>

const zhCN: TranslationTable = {
  appName: '书签管理',
  adminConsole: '管理控制台',
  administrator: '管理员',
  signOut: '退出登录',
  serviceOnline: '服务正常',
  adminWorkspace: '管理控制台',
  navOverview: '概览',
  navDataManagement: '数据管理',
  navStorage: '存储文件',
  navLibrary: '我的书签库',
  navCategories: '分类管理',
  navTrash: '回收站',
  navSecurityManagement: '安全管理',
  navSidebarConnection: '侧边栏连接',
  navBackup: '数据备份',
  navDevices: '设备管理',
  navSystemSettings: '系统设置',
  navAccount: '账号设置',
  navPreferences: '偏好设置',
  navImportExport: '导入/导出',
  navHelpSupport: '帮助与支持',
  navHelp: '帮助中心',
  navAbout: '关于项目',
  language: '界面语言',
  languageDescription: '立即切换管理后台的导航、标题、登录和设置界面。',
  languageChinese: '简体中文',
  languageEnglish: 'English',
  interfaceDensity: '界面密度',
  interfaceDensityDescription: '调整面板和列表的留白。',
  densityComfortable: '舒适',
  densityCompact: '紧凑',
  defaultPage: '默认打开页面',
  defaultPageDescription: '下次打开后台时优先进入的页面。',
  reduceMotion: '减少界面动效',
  reduceMotionDescription: '关闭页面过渡和悬停位移动效。',
  confirmDangerousActions: '危险操作始终确认',
  confirmDangerousActionsDescription: '永久删除、清空和撤销操作前显示确认弹窗。',
  preferencesSecurityNote: '不会在偏好设置中保存登录密码、应用密码、Floccus passphrase、书签明文或导入文件。',
  loginTitle: '管理你的同步服务',
  loginDescription: '登录后台生成侧边栏连接码，直接管理服务器书签；Floccus 兼容配置仍保留在隐藏页面。',
  emailOrUsername: '邮箱或用户名',
  password: '密码',
  login: '登录',
  createAccount: '创建账户',
  processing: '处理中…',
  noAccountCreate: '还没有账户？创建账户',
  hasAccountLogin: '已有账户？返回登录',
  loginHint: '账户密码只用于登录；侧边栏连接使用一次性设备码，不要填写账户密码。',
  requestFailed: '请求失败',
}

const en: TranslationTable = {
  appName: 'Bookmark Manager',
  adminConsole: 'ADMIN CONSOLE',
  administrator: 'Administrator',
  signOut: 'Sign out',
  serviceOnline: 'Service online',
  adminWorkspace: 'Admin workspace',
  navOverview: 'Overview',
  navDataManagement: 'DATA MANAGEMENT',
  navStorage: 'Storage files',
  navLibrary: 'My bookmark library',
  navCategories: 'Category management',
  navTrash: 'Trash',
  navSecurityManagement: 'SECURITY',
  navSidebarConnection: 'Sidebar connection',
  navBackup: 'Data backup',
  navDevices: 'Devices',
  navSystemSettings: 'SETTINGS',
  navAccount: 'Account',
  navPreferences: 'Preferences',
  navImportExport: 'Import / export',
  navHelpSupport: 'HELP & SUPPORT',
  navHelp: 'Help center',
  navAbout: 'About',
  language: 'Display language',
  languageDescription: 'Updates the admin navigation, headings, sign-in, and settings immediately.',
  languageChinese: '简体中文',
  languageEnglish: 'English',
  interfaceDensity: 'Interface density',
  interfaceDensityDescription: 'Adjust the spacing in panels and lists.',
  densityComfortable: 'Comfortable',
  densityCompact: 'Compact',
  defaultPage: 'Default page',
  defaultPageDescription: 'Choose the page opened first the next time you visit the admin console.',
  reduceMotion: 'Reduce motion',
  reduceMotionDescription: 'Turn off page transitions and hover movement.',
  confirmDangerousActions: 'Always confirm dangerous actions',
  confirmDangerousActionsDescription: 'Show a confirmation before permanently deleting, clearing, or revoking.',
  preferencesSecurityNote: 'Preferences never store your sign-in password, app password, Floccus passphrase, bookmark contents, or imported files.',
  loginTitle: 'Manage your sync service',
  loginDescription: 'Sign in to create a sidebar connection code and manage your server bookmarks directly. Floccus compatibility remains available on its hidden page.',
  emailOrUsername: 'Email or username',
  password: 'Password',
  login: 'Sign in',
  createAccount: 'Create account',
  processing: 'Working…',
  noAccountCreate: 'No account yet? Create one',
  hasAccountLogin: 'Already have an account? Sign in',
  loginHint: 'Your account password is only for signing in. The sidebar uses a one-time device code; never enter your account password there.',
  requestFailed: 'Request failed',
}

const translations: Record<Locale, TranslationTable> = { 'zh-CN': zhCN, en }

export function translate(locale: Locale, key: TranslationKey): string {
  return translations[locale][key]
}

/**
 * Text emitted by the existing feature modules.  Keeping this separate from
 * the navigation dictionary lets legacy and newly added pages share one
 * language boundary while their business data remains untouched.
 */
const englishInterfaceText: Record<string, string> = {
  '关闭': 'Close',
  '取消': 'Cancel',
  '确认': 'Confirm',
  '刷新': 'Refresh',
  '刷新中…': 'Refreshing…',
  '重新连接': 'Reconnect',
  '读取失败': 'Could not load',
  '操作失败': 'Action failed',
  '操作完成': 'Completed',
  '已完成': 'Done',
  '处理中…': 'Working…',
  '保存中…': 'Saving…',
  '保存': 'Save',
  '保存设置': 'Save settings',
  '保存修改': 'Save changes',
  '删除': 'Delete',
  '恢复': 'Restore',
  '清空': 'Clear',
  '下载': 'Download',
  '还原': 'Restore',
  '编辑': 'Edit',
  '打开': 'Open',
  '复制': 'Copy',
  '复制失败': 'Copy failed',
  '✓ 已复制': '✓ Copied',
  '生成中…': 'Creating…',
  '检查中…': 'Checking…',
  '运行正常': 'Running normally',
  '无法连接': 'Unable to connect',
  '正常': 'Normal',
  '成功': 'Succeeded',
  '失败': 'Failed',
  '执行中': 'Running',
  '已撤销': 'Revoked',
  '已连接': 'Connected',
  '已过期': 'Expired',
  '待连接': 'Pending',
  '根目录': 'Root',
  '书签': 'Bookmark',
  '文件夹': 'Folder',
  '名称': 'Name',
  '网址': 'URL',
  '保存到': 'Save to',
  '所在文件夹': 'Folder',
  '操作': 'Actions',
  '全部书签': 'All bookmarks',
  '未命名书签': 'Untitled bookmark',
  '没有匹配的书签': 'No matching bookmarks',
  '没有匹配的帮助内容': 'No matching help content',
  '还没有历史版本': 'No history yet',
  '回收站是空的': 'Trash is empty',
  '已删除的书签': 'Deleted bookmarks',
  '清空回收站': 'Empty trash',
  '确认恢复': 'Restore',
  '确认导入': 'Import',
  '确认还原': 'Restore',
  '永久删除': 'Permanently delete',
  '恢复书签？': 'Restore bookmark?',
  '清空回收站？': 'Empty trash?',
  '永久删除？': 'Permanently delete?',
  '撤销这个设备？': 'Revoke this device?',
  '确认撤销': 'Revoke',
  '备份计划': 'Backup schedule',
  '自动备份': 'Automated backups',
  '立即备份': 'Back up now',
  '备份中…': 'Backing up…',
  '最近备份': 'Recent backups',
  '启用每日自动备份': 'Enable daily backups',
  '每天执行时间': 'Daily run time',
  '最多保留份数': 'Maximum backups to keep',
  '下一次备份：': 'Next backup: ',
  '关闭后不会执行定时备份。': 'No scheduled backup will run while disabled.',
  '还没有备份记录': 'No backup records yet',
  '导出同步文件': 'Export sync file',
  '导入文件': 'Import file',
  '文件大小': 'File size',
  '最近修改': 'Last modified',
  '准备下载…': 'Preparing download…',
  '历史版本': 'History',
  '清理旧版本': 'Clean up old versions',
  '选择 HTML、XBEL 或 JSON 文件': 'Choose an HTML, XBEL, or JSON file',
  '导入到我的书签库': 'Import into my bookmark library',
  '导入并覆盖同步文件': 'Import and replace sync file',
  '服务状态': 'Service status',
  '当前架构': 'Current architecture',
  '刷新状态': 'Refresh status',
  '账号信息': 'Account information',
  '同步连接信息': 'Sync connection details',
  '账号状态': 'Account status',
  '登录方式': 'Sign-in method',
  '邮箱或用户名': 'Email or username',
  '账户安全': 'Account security',
  '删除账户': 'Delete account',
  '侧边栏连接': 'Sidebar connection',
  '已创建的连接码': 'Created connection codes',
  '浏览器名称': 'Browser name',
  'API 地址': 'API address',
  '设备码': 'Device code',
  '生成另一个连接码': 'Create another connection code',
  '生成侧边栏连接码': 'Create sidebar connection code',
  '正在读取连接码': 'Loading connection codes',
  '还没有创建连接码': 'No connection codes yet',
  'Floccus 配置向导': 'Floccus setup guide',
  '创建 Floccus 专用密码': 'Create a Floccus password',
  '安装官方 Floccus': 'Install Floccus',
  '在 Floccus 中填写 WebDAV 配置': 'Configure WebDAV in Floccus',
  '开启加密，并再次填写同一串': 'Enable encryption and enter the same password',
  '创建中…': 'Creating…',
  '正在生成…': 'Generating…',
  '生成并填入专用密码': 'Generate and fill password',
  '还没有专用密码': 'No password yet',
  '书签组织架构': 'Bookmark organization',
  '服务器书签组织架构': 'Server bookmark organization',
  '收起': 'Collapse',
  '展开': 'Expand',
  '展开全部': 'Expand all',
  '收起全部': 'Collapse all',
  '按文件夹分类': 'Grouped by folder',
  '选择目标文件夹…': 'Choose destination folder…',
  '可批量移动或移入回收站': 'Move in bulk or send to trash',
  '取消选择': 'Clear selection',
  '确认移动': 'Move',
  '移动到…': 'Move to…',
  '服务器书签库暂时无法连接': 'Server bookmark library is unavailable',
  '正在加载服务器书签库…': 'Loading server bookmark library…',
  '我的服务器书签库': 'My server bookmark library',
  '独立书签库': 'Independent bookmark library',
  '新建内容': 'Create content',
  '从 Floccus 同步库迁移': 'Migrate from Floccus sync library',
  '复制现有同步书签': 'Copy existing synced bookmarks',
  '迁移完成': 'Migration complete',
  '导入浏览器书签': 'Import browser bookmarks',
  '选择浏览器书签文件': 'Choose browser bookmark file',
  '文件夹管理': 'Folder management',
  '服务器书签库回收站': 'Server bookmark library trash',
  '暂无文件夹，可在上方新建文件夹。': 'No folders yet. Create one above.',
  '暂无已删除的服务器书签。这里与 Floccus 同步回收站完全独立。': 'No deleted server bookmarks. This trash is separate from Floccus sync trash.',
  '编辑书签': 'Edit bookmark',
  '编辑文件夹': 'Edit folder',
  '修改后会立即同步到服务器书签库。': 'Changes are saved to the server bookmark library immediately.',
  '移动文件夹会保留其中的书签和子文件夹。': 'Moving a folder preserves its bookmarks and child folders.',
  '查看 Floccus 配置': 'View Floccus setup',
  '前往 Floccus 配置': 'Go to Floccus setup',
  '服务端只保存 Floccus 加密数据 · 书签内容由浏览器和 Floccus 管理': 'The server stores Floccus encrypted data only · bookmarks are managed by the browser and Floccus',
  '服务器存储摘要': 'Server storage summary',
  '端到端加密': 'End-to-end encrypted',
  '同步文件': 'Sync files',
  '存储占用': 'Storage used',
  '同步状态': 'Sync status',
  '文件数量': 'Files',
  '占用空间': 'Storage used',
  '单文件上限': 'Per-file limit',
  '暂无记录': 'No records',
  '读取中': 'Loading',
  '尚未同步': 'Not synced yet',
  '尚未配置 Floccus': 'Floccus is not configured',
  '待配置': 'Needs setup',
  '准备就绪': 'Ready',
  '从服务器书签库开始管理': 'Start with your server bookmark library',
  '三步完成配置': 'Get set up in three steps',
  '连接服务器书签库': 'Connect the server bookmark library',
  '直接收藏和整理': 'Save and organize directly',
}

const englishInterfacePatterns: Array<[RegExp, string]> = [
  [/^已选择 (\d+) 个$/, 'Selected $1'],
  [/^(\d+) 个结果 · (\d+) 个文件夹$/, '$1 results · $2 folders'],
  [/^(\d+) 个书签 · 总目录$/, '$1 bookmarks · all folders'],
  [/^(\d+) 条书签$/, '$1 bookmarks'],
  [/^显示 (\d+) 条$/, 'Showing $1'],
  [/^当前筛选：(\d+) 条$/, 'Current filter: $1'],
  [/^(\d+) 个$/, '$1'],
  [/^(\d+) 项$/, '$1 items'],
  [/^(\d+) 级$/, 'Level $1'],
  [/^已将 (\d+) 个书签归入目标文件夹$/, 'Moved $1 bookmarks to the destination folder'],
  [/^已将 (\d+) 个书签移入服务器书签库回收站$/, 'Moved $1 bookmarks to the server library trash'],
  [/^已导入 (\d+) 个书签节点到服务器书签库$/, 'Imported $1 bookmark nodes into the server library'],
  [/^已迁移 (\d+) 个节点$/, 'Migrated $1 nodes'],
  [/^创建于 (.+) · 已完成连接$/, 'Created $1 · connected'],
  [/^创建于 (.+) · 有效期至 (.+)$/, 'Created $1 · expires $2'],
  [/^有效期至 (.+)，且只能使用一次。$/, 'Expires $1 and can only be used once.'],
  [/^删除于 (.+)$/, 'Deleted $1'],
  [/^最近活动 (.+) · 登记于 (.+)$/, 'Active $1 · registered $2'],
  [/^下一次备份：(.*)$/, 'Next backup: $1'],
  [/^备份已完成：(.*)。$/, 'Backup complete: $1.'],
  [/^已清理 (\d+) 个旧版本。$/, 'Cleaned up $1 old versions.'],
  [/^已移动 (\d+) 个书签，等待 Floccus 同步到浏览器$/, 'Moved $1 bookmarks; waiting for Floccus to sync to the browser'],
  [/^将“(.+)”移入服务器书签库回收站？$/, 'Move “$1” to the server library trash?'],
  [/^将“(.+)”及其子内容移入服务器书签库回收站？$/, 'Move “$1” and its contents to the server library trash?'],
  [/^将“(.+)”及其子内容永久删除？此操作无法恢复。$/, 'Permanently delete “$1” and its contents? This cannot be undone.'],
  [/^(\d+) 个书签 · (\d+) 个文件夹$/, '$1 bookmarks · $2 folders'],
  [/^显示 (\d+) \/ (\d+)$/, 'Showing $1 / $2'],
  [/^最近同步 (.+)$/, 'Last synced $1'],
  [/^单文件上限 (.+)$/, 'Per-file limit $1'],
  [/^(.*) 条书签$/, '$1 bookmarks'],
  [/^(.*) 个文件夹$/, '$1 folders'],
  [/^原位置：(.*)$/, 'Original location: $1'],
  [/^(.+) · 删除于 (.+)$/, '$1 · deleted $2'],
  [/^(.+) · 登记于 (.+)$/, '$1 · registered $2'],
  [/^(.+) 个可用历史版本$/, '$1 available history versions'],
  [/^(.+) 个浏览器书签到“我的书签库”，不会覆盖 Floccus 同步文件。$/, 'Imported $1 browser bookmarks into “My bookmark library”; the Floccus sync file remains unchanged.'],
  [/^已导入 (.+) 个浏览器书签到“我的书签库”，不会覆盖 Floccus 同步文件。$/, 'Imported $1 browser bookmarks into “My bookmark library”; the Floccus sync file remains unchanged.'],
  [/^已导入 (.+) 个书签节点到服务器书签库$/, 'Imported $1 bookmark nodes into the server library'],
  [/^已迁移 (.+) 个节点$/, 'Migrated $1 nodes'],
  [/^创建于 (.+) · 有效期至 (.+)$/, 'Created $1 · expires $2'],
  [/^有效期至 (.+)，且只能使用一次。$/, 'Expires $1 and can be used only once.'],
  [/^(.+)连接码已生成，请立即使用$/, '$1 connection code is ready. Use it now.'],
  [/^删除于 (.+)$/, 'Deleted $1'],
  [/^(.+) 级$/, 'Level $1'],
  [/^下一次备份：(.*)$/, 'Next backup: $1'],
  [/^备份已完成：(.*)。$/, 'Backup complete: $1.'],
  [/^已清理 (.+) 个旧版本。$/, 'Cleaned up $1 old versions.'],
  [/^已移动 (.+) 个书签，等待 Floccus 同步到浏览器$/, 'Moved $1 bookmarks; waiting for Floccus to sync to the browser'],
]

Object.assign(englishInterfaceText, {
  '401 409 422 423 429 错误': 'Errors 401 409 422 423 429',
  '401 表示需要重新登录；409 表示文件已被其他同步更新；422 表示文件格式无法识别；423 表示 Floccus 正在持有文件锁；429 表示请求过于频繁。': '401 means you need to sign in again; 409 means another sync changed the file; 422 means the file format is unrecognized; 423 means Floccus holds a file lock; 429 means too many requests.',
  '24 小时制，例如 03:00。': 'Uses 24-hour time, for example 03:00.',
  'API 服务': 'API service',
  'API 版本': 'API version',
  'Chrome 应用商店': 'Chrome Web Store',
  'Edge 应用商店': 'Edge Add-ons',
  'Floccus 专用密码 / 旧 Passphrase': 'Floccus password / legacy passphrase',
  'Floccus 专用密码或旧配置 Passphrase': 'Floccus password or legacy passphrase',
  'Floccus 书签同步': 'Floccus bookmark sync',
  'Floccus 仍在同步，请先取消并等待停止后重试。': 'Floccus is still syncing. Cancel it and wait for it to stop before trying again.',
  'Floccus 兼容同步仍可使用下面的 WebDAV 地址和用户名；自有侧边栏连接不需要应用密码。': 'Floccus-compatible sync can still use the WebDAV address and username below; the native sidebar connection does not need an app password.',
  'Floccus 兼容配置': 'Floccus compatibility setup',
  'Floccus 同步数据': 'Floccus sync data',
  'Floccus 正在同步文件，请稍后再试。': 'Floccus is synchronizing the file. Please try again shortly.',
  'Floccus 配置': 'Floccus setup',
  'Floccus 配置仍作为隐藏兼容页面保留；新浏览器推荐使用“侧边栏连接”建立服务器书签库连接。': 'Floccus setup remains available as a hidden compatibility page; new browsers should use Sidebar connection to access the server bookmark library.',
  'HTML 导入会保留文件夹层级，不会修改 Floccus 同步文件。': 'HTML imports preserve folders and do not modify the Floccus sync file.',
  'WOTTY BOOKMARK 管理后台': 'WOTTY BOOKMARK admin console',
  'WebDAV Password = Encryption Passphrase；后台已自动保存受保护副本。': 'WebDAV Password = Encryption Passphrase; a protected copy is saved automatically.',
  'WebDAV 地址': 'WebDAV address',
  'WebDAV 地址会随当前访问地址生成。部署到服务器后，这里会自动显示服务器域名。': 'The WebDAV address follows the current access address. After deployment, your server domain appears here automatically.',
  'WebDAV 用户名': 'WebDAV username',
  'XBEL/JSON 导入会覆盖当前同步文件并先保存历史版本 ·': 'XBEL/JSON imports replace the current sync file after saving a history version ·',
  'XBEL/JSON 导入会覆盖当前同步文件，并先创建历史版本；加密文件会尝试使用服务器已保存的 passphrase 建立索引。': 'XBEL/JSON imports replace the current sync file after creating a history version; encrypted files attempt to build an index with the passphrase saved on the server.',
  '· 删除于': '· deleted ',
  '· 登记于': '· registered ',
  '”连接码已生成，请立即使用': '” connection code is ready. Use it now.',
  '一次性设备码': 'One-time device code',
  '下载为完整服务器归档，包含数据库、主密钥、同步文件和历史版本。还原会先自动创建当前数据保护备份，并需要重启 API 服务。': 'Downloads are complete server archives containing the database, master key, sync files, and history. Restoring first protects current data and requires an API restart.',
  '下载当前 `bookmarks.xbel` 原始文件，可用于备份或迁移到另一台服务。': 'Download the current raw `bookmarks.xbel` file for backup or migration to another service.',
  '专用密码创建时，服务器会同时保存 WebDAV 认证哈希和由主密钥保护的 Passphrase 加密信封。首次同步后可自动建立索引；该模式不属于零知识加密，服务器管理员能够解密书签。旧配置仍使用原来的独立 Passphrase。': 'When a dedicated password is created, the server saves both a WebDAV authentication hash and a passphrase envelope protected by the master key. It can build an index after the first sync; this is not zero-knowledge encryption and server administrators can decrypt bookmarks. Legacy configurations retain their original passphrase.',
  '两处填写同一串。': 'Enter the same password in both places.',
  '个': 'items',
  '删除于': 'Deleted',
  '刷新分类树': 'Refresh category tree',
  '前往同步配置': 'Go to sync setup',
  '备份已完成：': 'Backup complete: ',
  '导入/导出': 'Import / export',
  '导入完成': 'Import complete',
  '导入并覆盖？': 'Import and replace?',
  '导出 bookmarks.xbel': 'Export bookmarks.xbel',
  '导出同步文件失败': 'Could not export sync file',
  '已导入': 'Imported',
  '已选择': 'Selected',
  '当前筛选：': 'Current filter: ',
  '恢复历史版本？': 'Restore history version?',
  '所选文件': 'Selected file',
  '折叠': 'Collapse',
  '操作失败，请重试': 'Action failed. Please try again.',
  '显示': 'Showing',
  '最近活动': 'Last active',
  '有效期至': 'Expires',
  '服务器书签列表': 'Server bookmark list',
  '服务器书签库': 'Server bookmark library',
  '服务器书签库回收站已清空': 'Server bookmark library trash emptied',
  '服务器书签库读取失败': 'Could not load server bookmark library',
  '服务器书签库还是空的': 'Server bookmark library is empty',
  '服务器仍有旧加密文件。请先到分类管理点击“忘记旧口令，备份后重建”，然后回来创建专用密码。': 'The server still has an old encrypted file. In Category management, choose “Forget old password and rebuild after backup”, then return here to create a dedicated password.',
  '服务器会保存哪些数据？': 'What data does the server store?',
  '服务器保存账户元数据、Floccus 同步文件和可重建的书签索引。若启用后台解锁，还会保存由服务器主密钥加密的 Floccus passphrase；因此该模式不属于零知识加密。': 'The server stores account metadata, Floccus sync files, and a rebuildable bookmark index. If admin unlocking is enabled, it also stores the Floccus passphrase encrypted with the server master key; this is therefore not zero-knowledge encryption.',
  '服务器已移除受保护的 passphrase，并清除了可搜索索引；加密同步文件仍保留': 'The server removed the protected passphrase and searchable index; the encrypted sync file remains.',
  '服务器已解锁 Floccus 加密文件；这不是零知识模式。': 'The server unlocked the Floccus encrypted file; this is not zero-knowledge mode.',
  '服务器还没有收到 `bookmarks.xbel`，请先在 Floccus 中完成一次同步。': 'The server has not received `bookmarks.xbel` yet. Complete one sync in Floccus first.',
  '服务端只保存加密后的同步文件，不解析、不展示书签名称、网址、分类或标签。': 'The server stores encrypted sync files only and does not parse or show bookmark names, URLs, folders, or tags.',
  '条': 'items',
  '条书签': 'bookmarks',
  '根目录下': 'At root',
  '格式待处理': 'Format pending',
  '清除搜索': 'Clear search',
  '用户名': 'Username',
  '登录已过期，请重新登录。': 'Your session expired. Sign in again.',
  '登录已过期，请重新登录后再试。': 'Your session expired. Sign in again and retry.',
  '登录账号 · WebDAV 用户名': 'Sign-in account · WebDAV username',
  '移动到此处': 'Move here',
  '至少 12 个字符': 'At least 12 characters',
  '让书签管理回到你自己的服务器。后台负责账户、设备和书签库状态；侧边栏负责日常收藏、整理和访问。': 'Bring bookmark management back to your own server. The admin console handles account, devices, and library status; the sidebar handles daily saving, organization, and access.',
  '读取存储状态失败': 'Could not load storage status',
  '返回分类管理': 'Back to Category management',
  '还没有可管理的书签索引': 'There is no manageable bookmark index yet',
  '还没有同步文件': 'There is no sync file yet',
  '还没有登记设备': 'There are no registered devices yet',
  '这一串同时用于 WebDAV 连接和书签加密。只显示一次，请先复制保存。': 'This password is used for both WebDAV connection and bookmark encryption. It is shown only once, so copy and save it now.',
  '这一份书签独立于 Floccus 和浏览器原生书签。WOTTY 侧边栏的“收藏当前页”只写入此处，不会读取或改动浏览器的书签栏。': 'This bookmark collection is independent of Floccus and browser-native bookmarks. The WOTTY sidebar “Save current page” action writes only here and never reads or changes the browser bookmark bar.',
  '这个管理模块正在设计中，书签管理和侧边栏会保持独立运行。': 'This management module is still being designed. Bookmark management and the sidebar continue to work independently.',
  '这些书签已经在目标文件夹中': 'These bookmarks are already in the destination folder',
  '这会永久删除回收站中的所有记录，且无法恢复。': 'This permanently deletes every trash record and cannot be undone.',
  '这会覆盖当前数据库、主密钥、同步文件和历史版本。系统会先自动保护当前数据；还原后必须重启 API 服务。': 'This replaces the current database, master key, sync files, and history. Current data is protected first; restart the API service after restoration.',
  '这条回收站记录将被永久删除，当前同步文件不会改变。': 'This trash record is permanently deleted; the current sync file is unchanged.',
  '进入“侧边栏连接”，填写浏览器名称并生成一次性设备码，然后在 WOTTY BOOKMARK 侧边栏输入 API 地址和设备码。连接码 10 分钟内有效且只能使用一次。': 'Go to Sidebar connection, enter a browser name, and create a one-time device code. Then enter the API address and device code in the WOTTY BOOKMARK sidebar. The code works once and expires in 10 minutes.',
  '连接码列表读取失败': 'Could not load connection codes',
  '连接码撤销失败': 'Could not revoke connection code',
  '配置 Floccus 后开始同步': 'Sync starts after Floccus is configured',
  '项': 'items',
  '个书签 · 总目录': 'bookmarks · all folders',
  '个书签节点到服务器书签库': 'bookmark nodes into the server library',
  '个可用历史版本': 'available history versions',
  '个文件夹': 'folders',
  '个浏览器书签到“我的书签库”，不会覆盖 Floccus 同步文件。': 'browser bookmarks into “My bookmark library”; the Floccus sync file remains unchanged.',
  '个结果 ·': 'results ·',
  '为不同浏览器生成的连接码会显示在这里。': 'Connection codes created for different browsers appear here.',
  '为了保护你的隐私，后台不会提供书签明文管理功能。请通过浏览器原生书签和 Floccus 管理书签内容。': 'To protect your privacy, this area does not manage plaintext bookmarks. Use browser-native bookmarks and Floccus to manage bookmark contents.',
  '为什么后台能管理加密书签？': 'Why can the admin console manage encrypted bookmarks?',
  '为每个浏览器生成一次性连接码。连接后，侧边栏会直接管理服务器书签库，不需要应用密码或 WebDAV 配置。': 'Create a one-time connection code for each browser. Once connected, the sidebar manages the server bookmark library directly without an app password or WebDAV setup.',
  '也可以拖动已选书签到左侧文件夹': 'You can also drag selected bookmarks to a folder on the left',
  '书签会恢复到原文件夹；如果原文件夹不存在，将恢复到根目录。': 'The bookmark returns to its original folder, or to the root if that folder no longer exists.',
  '书签保存在你自己的服务器上；为每个浏览器生成一次性连接码后，就能在侧边栏直接收藏、整理和访问。': 'Bookmarks live on your own server. Create a one-time connection code for each browser to save, organize, and open them directly from the sidebar.',
  '书签内容仍由 Floccus 加密同步；此页面使用服务器索引进行查找和整理。': 'Bookmark contents remain synchronized through Floccus encryption; this page uses the server index for browsing and organization.',
  '书签名称': 'Bookmark name',
  '书签已保存到服务器书签库': 'Bookmark saved to the server library',
  '书签已恢复，等待 Floccus 同步。': 'Bookmark restored; waiting for Floccus to sync.',
  '书签已更新': 'Bookmark updated',
  '书签归类失败，请刷新后重试': 'Could not organize bookmarks. Refresh and try again.',
  '书签数据保存在自有服务器并跨浏览器使用': 'Bookmark data is stored on your server and shared across browsers',
  '书签文件夹': 'Bookmark folders',
  '书签移动失败，请刷新后重试': 'Could not move bookmarks. Refresh and try again.',
  '书签读取失败': 'Could not load bookmarks',
  '仅当浏览器本地书签仍完整、但旧 Floccus 加密 Passphrase 已忘记时继续。请先取消同步。旧密文会保留到历史版本，远端基线和服务器旧口令会被移除。继续吗？': 'Continue only if browser-local bookmarks remain intact but the old Floccus encryption passphrase is lost. Cancel syncing first. The old ciphertext is retained in history while the remote baseline and saved passphrase are removed. Continue?',
  '仅用于旧版 WebDAV 同步，侧边栏无需应用密码': 'For legacy WebDAV sync only; the sidebar needs no app password',
  '从分类管理页移除的书签会显示在这里。': 'Bookmarks removed from Category management appear here.',
  '从服务器加载最新的 Floccus 数据。': 'Loading the latest Floccus data from the server.',
  '例如：Chrome 工作浏览器': 'For example: Chrome work browser',
  '例如：稍后阅读': 'For example: Read later',
  '侧边栏 API 地址 设备码 pairing': 'sidebar API address device code pairing',
  '侧边栏 API 地址 设备码 浏览器名称': 'sidebar API address device code browser name',
  '侧边栏的新增、移动和删除会直接保存到服务器书签库。': 'Sidebar additions, moves, and deletions are saved directly to the server library.',
  '侧边栏设备码如何使用？': 'How do I use a sidebar device code?',
  '保存到服务器': 'Save to server',
  '保存的 Floccus 加密口令已失效': 'The saved Floccus encryption passphrase is no longer valid',
  '先创建一串 Floccus 专用密码，在 WebDAV Password 和 Encryption Passphrase 两处填写同一串。完成同步后，后台会自动建立可管理索引。': 'First create a Floccus password and enter it for both WebDAV Password and Encryption Passphrase. The admin console automatically builds a manageable index after sync.',
  '全部书签': 'All bookmarks',
  '关闭后不会执行定时备份。': 'No scheduled backup will run while disabled.',
  '创建于': 'Created',
  '创建失败': 'Could not create',
  '删除书签失败，请刷新后重试': 'Could not delete bookmarks. Refresh and try again.',
  '前往分类管理解锁': 'Go to Category management to unlock',
  '加密 passphrase 隐私 xbel': 'encryption passphrase privacy xbel',
  '加密书签已解锁，后台可以整理并继续写回 Floccus 加密文件': 'Encrypted bookmarks unlocked; the admin console can organize and write back to the Floccus encrypted file',
  '加密书签解锁失败': 'Could not unlock encrypted bookmarks',
  '加密同步文件已导入；若已保存的 passphrase 匹配，索引会自动更新，否则请重新解锁。': 'Encrypted sync file imported. The index updates automatically if the saved passphrase matches; otherwise unlock it again.',
  '加密文件尚未在后台解锁': 'Encrypted file is not unlocked in the admin console',
  '历史版本 恢复 备份 导入导出': 'history restore backup import export',
  '历史版本已恢复。': 'History version restored.',
  '历史版本恢复失败': 'Could not restore history version',
  '历史版本清理失败': 'Could not clean up history',
  '原位置：': 'Original location: ',
  '只有确认浏览器本地书签仍完整、旧 Passphrase 确实找不回时才使用重建。': 'Rebuild only when browser-local bookmarks are intact and the old passphrase cannot be recovered.',
  '可在侧边栏收藏当前页，或从上方迁移 / 导入书签。': 'Save the current page from the sidebar, or migrate / import bookmarks above.',
  '同步基线重建失败': 'Could not rebuild sync baseline',
  '同步完成后不需要再去分类管理验证，服务器会自动解密并建立索引。': 'After syncing, you do not need to verify in Category management; the server decrypts and creates an index automatically.',
  '同步文件已发生变化，请刷新后重试。': 'The sync file changed. Refresh and try again.',
  '同步文件已变化，请刷新后重试。': 'The sync file changed. Refresh and try again.',
  '同步文件已开始下载。': 'Sync file download started.',
  '同步文件被覆盖后，系统会自动保留最近的版本。': 'The system automatically keeps recent versions when a sync file is replaced.',
  '同步连接信息': 'Sync connection information',
  '后台解锁加密书签后，Floccus passphrase 会由服务器主密钥加密保存。页面不会显示口令；移除服务器口令不会删除加密同步文件。': 'After encrypted bookmarks are unlocked in the admin console, the Floccus passphrase is stored encrypted with the server master key. It is never shown on the page; removing it does not delete the encrypted sync file.',
  '启用每日自动备份': 'Enable daily automatic backups',
  '和“我的书签库”共享同一份服务器数据；书签和文件夹都可以拖动重组。': 'Shares the same server data as “My bookmark library”; bookmarks and folders can both be reorganized by dragging.',
  '回收站已清空。': 'Trash emptied.',
  '回收站读取失败': 'Could not load trash',
  '在 Floccus 中开启加密，将第一步生成的专用密码粘贴到 Passphrase：': 'Enable encryption in Floccus and paste the password from step 1 into Passphrase:',
  '在 WOTTY BOOKMARK 侧边栏输入 API 地址和一次性设备码。': 'Enter the API address and one-time device code in the WOTTY BOOKMARK sidebar.',
  '在“侧边栏连接”页面填写浏览器名称并生成连接信息，将 API 地址和一次性设备码分别填入 WOTTY BOOKMARK 侧边栏。设备码 10 分钟内有效且只能使用一次，连接后不需要应用密码或登录密码。': 'On Sidebar connection, enter a browser name and generate connection information. Enter the API address and one-time device code in the WOTTY BOOKMARK sidebar. The code lasts 10 minutes, works once, and requires neither an app password nor sign-in password after connection.',
  '在浏览器插件市场搜索': 'Search the browser extension store for',
  '填写浏览器名称，生成一次性连接码并在侧边栏完成绑定。': 'Enter a browser name, create a one-time connection code, and finish pairing in the sidebar.',
  '备份下载失败': 'Could not download backup',
  '备份归档已开始下载。': 'Backup archive download started.',
  '备份或恢复原始同步文件': 'Back up or restore the raw sync file',
  '备份执行失败': 'Backup failed',
  '备份服务暂时无法连接': 'Backup service is unavailable',
  '备份状态读取失败': 'Could not load backup status',
  '备份设置保存失败': 'Could not save backup settings',
  '备份设置已保存。': 'Backup settings saved.',
  '备份还原失败': 'Could not restore backup',
  '复制当前 XBEL 同步索引到服务器书签库。它不会删除或改写 Floccus 数据。': 'Copy the current XBEL sync index to the server library. It does not delete or modify Floccus data.',
  '复制这一串，后面两处都填它': 'Copy this password and use it in both fields below',
  '如何恢复历史版本？': 'How do I restore a history version?',
  '如何连接侧边栏？': 'How do I connect the sidebar?',
  '安全 隐私 数据 保存 服务器': 'security privacy data storage server',
  '完成一次 Floccus XBEL 同步并在需要时解锁后，回收站才可以提供条目级恢复。当前文件状态：': 'After one Floccus XBEL sync and an unlock when needed, the trash can restore individual items. Current file state: ',
  '导入会替换当前服务器书签库。确定继续吗？': 'Importing replaces the current server bookmark library. Continue?',
  '导入导出状态读取失败': 'Could not load import/export status',
  '导入文件失败': 'Could not import file',
  '将右侧书签拖入左侧文件夹即可归类': 'Drag bookmarks on the right into folders on the left to organize them',
  '将数据库、主密钥、同步文件和历史版本保存为一份可迁移的服务器快照。': 'Save the database, master key, sync files, and history as one portable server snapshot.',
  '将选中的书签移动到文件夹': 'Move selected bookmarks to folder',
  '左侧书签拖入文件夹；右侧文件夹可互相嵌套，拖到“全部书签”可移回顶级': 'Drag bookmarks on the left into folders; folders on the right can nest. Drag to “All bookmarks” to return to the top level.',
  '已从回收站恢复到服务器书签库': 'Restored from trash to the server library',
  '已完成连接': 'Connected',
  '已永久删除回收站内容': 'Trash content permanently deleted',
  '已永久删除回收站记录。': 'Trash record permanently deleted.',
  '已登记设备': 'Registered devices',
  '常见主题': 'Popular topics',
  '常见错误状态是什么意思？': 'What do common error states mean?',
  '并安装，或点击下方直达链接。': 'and install it, or use the direct links below.',
  '开启加密，并再次填写同一串': 'Enable encryption and enter the same password again',
  '当前 XBEL 缺少 Floccus 节点 ID，后台已暂停移动和删除，避免产生大量误删。请在分类管理页面使用快速重建入口，或先在 Floccus 中执行一次“向上推一次”。': 'The current XBEL lacks Floccus node IDs, so moving and deleting are paused to avoid mass accidental deletion. Use the fast rebuild action in Category management, or run “push once” in Floccus first.',
  '当前没有可导出的同步文件。': 'There is no sync file to export.',
  '当前设备': 'Current device',
  '当前设备登记失败': 'Could not register current device',
  '忘记旧口令，备份后重建': 'Forget old password and rebuild after backup',
  '我已推送，重新检查': 'I pushed changes; check again',
  '所选书签已经位于该文件夹中': 'Selected bookmarks are already in that folder',
  '打开 Floccus 设置页，选择': 'Open Floccus settings and choose',
  '打开书签': 'Open bookmark',
  '打开后台后，当前浏览器会自动登记为一个设备。': 'Opening the admin console automatically registers this browser as a device.',
  '拖动到其他文件夹可移动整棵分支': 'Drag to another folder to move this entire branch',
  '拖动到右侧文件夹': 'Drag to the folder on the right',
  '拖动到左侧文件夹': 'Drag to the folder on the left',
  '按住书签行并上下滑动可连续多选；按住任意书签行拖到右侧文件夹即可归档，已选书签会一并移动。': 'Hold a bookmark row and slide up or down to select continuously; drag any part of a bookmark row to a folder on the right to organize it. Selected bookmarks move together.',
  '按服务器本地时间执行。服务重启后会继续运行。': 'Runs in the server local time and continues after a service restart.',
  '换一个关键词试试。': 'Try another keyword.',
  '换个关键词，或切换左侧文件夹。': 'Try another keyword or choose a folder on the left.',
  '换个搜索关键词，或先在右侧选择其他文件夹。': 'Try another search term or choose a different folder on the right.',
  '推荐使用“侧边栏连接”生成一次性设备码。应用密码接口仅为旧版 Floccus 配置保留，不在后台提供创建入口。': 'Use Sidebar connection to create a one-time device code. App-password APIs remain only for legacy Floccus configuration and cannot be created in the admin console.',
  '搜索书签、网址或文件夹': 'Search bookmarks, URLs, or folders',
  '搜索书签名称、网址或文件夹': 'Search bookmark names, URLs, or folders',
  '搜索服务器书签': 'Search server bookmarks',
  '搜索标题、网址或文件夹': 'Search titles, URLs, or folders',
  '搜索配置、加密、错误码…': 'Search setup, encryption, error codes…',
  '撤销中…': 'Revoking…',
  '撤销后，该设备关联的后台会话会立即失效，需要重新连接。': 'After revocation, the admin session linked to this device is invalidated immediately and must reconnect.',
  '撤销授权': 'Revoke access',
  '撤销这个侧边栏连接码？已连接的该浏览器会立即失去访问权限。': 'Revoke this sidebar connection code? The connected browser loses access immediately.',
  '支持 Chrome、Edge、Firefox 导出的 HTML，也支持 XBEL 文件；会导入到独立服务器书签库。': 'Supports bookmark HTML exported by Chrome, Edge, and Firefox, plus XBEL files. Imports go to the independent server library.',
  '放入此处': 'Drop here',
  '放大组织树': 'Zoom in organization tree',
  '文件名（Bookmarks file）': 'File name (Bookmarks file)',
  '文件夹及其全部内容已移动': 'Folder and all contents moved',
  '文件夹及其内容': 'Folder and contents',
  '文件夹已保存到服务器书签库': 'Folder saved to the server library',
  '文件夹已更新': 'Folder updated',
  '文件夹已移动到顶级目录': 'Folder moved to top level',
  '文件夹移动失败，请刷新后重试': 'Could not move folder. Refresh and try again.',
  '新向导创建的配置请填写同一串“Floccus 专用密码”；旧配置请填写当时单独设置的 Passphrase。': 'For configurations created by the new guide, enter the same Floccus password; legacy configurations use their separately configured passphrase.',
  '无法读取存储状态': 'Could not load storage status',
  '无法读取服务器书签库': 'Could not load server bookmark library',
  '无法连接服务，请确认 Rust API 正在运行。': 'Unable to connect. Confirm that the Rust API is running.',
  '旧密文已保存到历史版本。请在 Floccus 设置新的 Passphrase，再执行一次“向上推一次”。': 'Old ciphertext was saved to history. Set a new passphrase in Floccus, then run “push once”.',
  '明文 XBEL 已导入并建立索引。': 'Plaintext XBEL imported and indexed.',
  '正在保存旧密文…': 'Saving old ciphertext…',
  '正在检查自动备份状态和最近记录。': 'Checking automatic backup status and recent records.',
  '正在确认当前同步文件的可用状态。': 'Checking the availability of the current sync file.',
  '正在读取与“我的书签库”一致的文件夹和书签。': 'Loading folders and bookmarks shared with “My bookmark library”.',
  '正在读取书签索引…': 'Loading bookmark index…',
  '正在读取回收站…': 'Loading trash…',
  '正在读取备份设置…': 'Loading backup settings…',
  '正在读取存储状态': 'Loading storage status',
  '正在读取服务器书签库…': 'Loading server bookmark library…',
  '正在读取设备…': 'Loading devices…',
  '每个浏览器单独命名并绑定设备会话': 'Each browser is named and bound to its own device session',
  '每次同步文件被覆盖前，系统会保存一个 opaque 快照。可以在导入/导出页查看并恢复最近版本；恢复前会再次保存当前文件。': 'Before each sync file replacement, the system saves an opaque snapshot. View and restore recent versions in Import / export; the current file is saved again before restoration.',
  '没有找到可导入的 HTTP/HTTPS 书签，请确认这是浏览器导出的书签 HTML 文件。': 'No importable HTTP/HTTPS bookmarks found. Confirm that this is a browser-exported bookmark HTML file.',
  '浏览器': 'Browser',
  '浏览器侧边栏': 'Browser sidebar',
  '浏览器导出的 HTML 会追加到“我的书签库”；XBEL/JSON 用于导入 Floccus 同步文件。单文件不超过 10 MB。': 'Browser-exported HTML is added to “My bookmark library”; XBEL/JSON imports Floccus sync files. Files must be 10 MB or smaller.',
  '浏览器拒绝访问剪贴板，请手动选择文本复制': 'The browser denied clipboard access. Select and copy the text manually.',
  '清理旧历史版本？被清理的版本将无法再恢复。': 'Clean up old history versions? Removed versions cannot be restored.',
  '清空服务器书签库回收站？所有已删除内容都将永久删除，无法恢复。': 'Empty the server library trash? All deleted content will be permanently removed and cannot be restored.',
  '点击“立即备份”创建第一份服务器快照。': 'Click “Back up now” to create the first server snapshot.',
  '点击后会生成一串密码，并自动填入上面的 WebDAV Password 和 Encryption Passphrase。': 'Click to generate a password and automatically fill the WebDAV Password and Encryption Passphrase above.',
  '直接操作服务器书签，不读取浏览器原生书签': 'Operates server bookmarks directly without reading browser-native bookmarks',
  '确认移动': 'Confirm move',
  '移入回收站': 'Move to trash',
  '移动中…': 'Moving…',
  '移动为顶级文件夹': 'Move to top level',
  '移动到文件夹': 'Move to folder',
  '移除 passphrase 失败': 'Could not remove passphrase',
  '移除已保存口令': 'Remove saved password',
  '移除服务器保存的 Floccus passphrase 和可搜索索引？加密同步文件不会删除，但后台将无法继续解锁它。': 'Remove the Floccus passphrase and searchable index stored by the server? The encrypted sync file remains, but the admin console can no longer unlock it.',
  '移除服务器口令': 'Remove server password',
  '等待同步': 'Waiting for sync',
  '管理后台版本 0.1.0 · 当前页面不会收集书签内容': 'Admin console version 0.1.0 · this page does not collect bookmark contents',
  '组织文件夹': 'Organize folders',
  '缩小组织树': 'Zoom out organization tree',
  '网站图标': 'Website icon',
  '自动备份已关闭': 'Automatic backups are off',
  '自动备份已开启': 'Automatic backups are on',
  '设备列表读取失败': 'Could not load device list',
  '设备撤销失败': 'Could not revoke device',
  '设备码创建失败': 'Could not create device code',
  '访问地址': 'Access address',
  '请先在分类管理页面输入 Floccus passphrase。解锁后，回收站可正常删除和恢复，并继续写回加密文件。': 'Enter the Floccus passphrase in Category management first. Once unlocked, trash items can be deleted and restored and continue writing to the encrypted file.',
  '请先填写浏览器名称': 'Enter a browser name first',
  '请更换搜索关键词。': 'Try a different search term.',
  '请求过于频繁，请稍后再试。': 'Too many requests. Please try again shortly.',
  '请稍候，正在从服务器获取真实数据。': 'Please wait while current data is fetched from the server.',
  '请稍后重试。': 'Please try again shortly.',
  '账号信息': 'Account information',
  '超出后自动删除最旧的备份目录和记录。': 'When exceeded, the oldest backup directory and record are removed automatically.',
  '输入 Floccus 加密口令解锁后台管理': 'Enter the Floccus encryption passphrase to unlock admin management',
  '远程撤销': 'Revoke remotely',
  '远端基线已清空。请在 Floccus 设置 Passphrase，再执行一次“向上推一次”。': 'The remote baseline was cleared. Set the passphrase in Floccus, then run “push once”.',
  '重新检查': 'Check again',
  '重置组织树视图': 'Reset organization tree view',
  '需要由浏览器重新建立同步身份': 'The browser must rebuild its sync identity',
  '验证中…': 'Verifying…',
  '验证并解锁': 'Verify and unlock',
  '验证成功后不再是零知识加密：拥有服务器主密钥和数据库的管理员可以解密书签。Floccus 加密口令不会显示在页面或写入日志。': 'After verification this is no longer zero-knowledge encryption: administrators with the server master key and database can decrypt bookmarks. The Floccus passphrase is never displayed or written to logs.',
  '（与 WebDAV Password 使用同一串）': '(Use the same password as WebDAV Password)',
  '（请先在上方创建 Floccus 专用密码）': '(Create a Floccus password above first)',
  '，且只能使用一次。': ', and it can be used only once.',
  '，依次填入以下字段：': ', then fill the following fields:',
})

export function translateInterfaceText(value: string, locale: Locale): string {
  if (locale === 'zh-CN') return value
  const match = value.match(/^(\s*)([\s\S]*?)(\s*)$/)
  const leading = match?.[1] ?? ''
  const source = match?.[2] ?? value
  const trailing = match?.[3] ?? ''
  const exact = englishInterfaceText[source]
  if (exact) return `${leading}${exact}${trailing}`
  for (const [pattern, replacement] of englishInterfacePatterns) {
    if (pattern.test(source)) return `${leading}${source.replace(pattern, replacement)}${trailing}`
  }
  return value
}

const originalText = new WeakMap<Text, string>()
const originalAttributes = new WeakMap<Element, Map<string, string>>()
const localizableAttributes = ['aria-label', 'title', 'placeholder']

function skipsTextLocalization(element: Element | null): boolean {
  return Boolean(element?.closest('[data-i18n-skip], code, pre, textarea, input, .library-bookmark-copy, .library-folder-copy, .category-bookmark-info, .organization-folder-button > span'))
}

function skipsAttributeLocalization(element: Element): boolean {
  // Input values, bookmark titles, folder names, and URLs are user data.
  // Their labels/placeholders remain application UI and should still translate.
  return Boolean(element.closest('[data-i18n-skip], code, pre, .library-bookmark-copy, .library-folder-copy, .category-bookmark-info, .organization-folder-button > span'))
}

function localizeTextNode(node: Text, locale: Locale) {
  if (skipsTextLocalization(node.parentElement)) return
  const current = node.data
  const saved = originalText.get(node)
  const translatedSaved = saved ? translateInterfaceText(saved, 'en') : undefined
  if (locale === 'zh-CN') {
    if (saved && current === translatedSaved) node.data = saved
    return
  }
  const source = saved && current === translatedSaved ? saved : current
  originalText.set(node, source)
  const translated = translateInterfaceText(source, locale)
  if (translated !== current) node.data = translated
}

function localizeAttribute(element: Element, attribute: string, locale: Locale) {
  if (skipsAttributeLocalization(element)) return
  const current = element.getAttribute(attribute)
  if (current === null) return
  const values = originalAttributes.get(element) ?? new Map<string, string>()
  const saved = values.get(attribute)
  const translatedSaved = saved ? translateInterfaceText(saved, 'en') : undefined
  if (locale === 'zh-CN') {
    if (saved && current === translatedSaved) element.setAttribute(attribute, saved)
    return
  }
  const source = saved && current === translatedSaved ? saved : current
  values.set(attribute, source)
  originalAttributes.set(element, values)
  const translated = translateInterfaceText(source, locale)
  if (translated !== current) element.setAttribute(attribute, translated)
}

function applyInterfaceLocalization(root: HTMLElement, locale: Locale) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    localizeTextNode(node as Text, locale)
    node = walker.nextNode()
  }
  root.querySelectorAll<HTMLElement>('*').forEach((element) => {
    localizableAttributes.forEach((attribute) => localizeAttribute(element, attribute, locale))
  })
}

/** Applies the selected interface language to every mounted admin page. */
export function GlobalUiLocalization({ children, locale }: { children: ReactNode; locale: Locale }) {
  const root = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = root.current
    if (!element) return
    const apply = () => applyInterfaceLocalization(element, locale)
    apply()
    const observer = new MutationObserver(apply)
    observer.observe(element, { attributes: true, attributeFilter: localizableAttributes, characterData: true, childList: true, subtree: true })
    return () => observer.disconnect()
  }, [locale])
  return createElement('div', { 'data-i18n-root': '', ref: root, style: { display: 'contents' } }, children)
}
