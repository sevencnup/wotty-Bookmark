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
