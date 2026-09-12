import { useEffect, useState } from 'react'
import {
  LayoutDashboard,
  Bookmark,
  HardDrive,
  FolderTree,
  Trash2,
  KeyRound,
  RefreshCw,
  Cloud,
  Laptop,
  User,
  Sliders,
  ArrowUpDown,
  HelpCircle,
  Info,
  Folder,
  Home,
  Search,
  ExternalLink,
  Shield,
  Check,
  Copy,
  Sparkles,
  ArrowRight,
  GripVertical,
  ShieldCheck,
  Zap,
  Activity,
  CheckCircle2,
  Lock,
  LogOut,
} from 'lucide-react'
import {
  TrashPage,
  DevicesPage,
  PreferencesPage,
  ImportExportPage,
  HelpPage,
  AboutPage,
  BackupPage,
} from './FeaturePages'
import { CategoryManagementPage } from './CategoryManagementPage'
import { LibraryManagementPage } from './LibraryManagementPage'
import { copyText } from './clipboard'
import * as api from './api'
import { loadPreferences, savePreferences, type Preferences } from './preferences'
import { descendantFolderIds, flattenFolders, findFolder, folderHasChildren, resolveDraggedBookmarkIds, visibleFolders, type FlatBookmarkFolder } from './bookmark-tree'

type AdminSection =
  | 'overview'
  | 'storage'
  | 'categories'
  | 'library'
  | 'trash'
  | 'app-passwords'
  | 'backup'
  | 'devices'
  | 'account'
  | 'preferences'
  | 'import-export'
  | 'floccus'
  | 'security'
  | 'help'
  | 'about'

type NavIconName =
  | 'overview'
  | 'storage'
  | 'categories'
  | 'library'
  | 'trash'
  | 'passwords'
  | 'backup'
  | 'devices'
  | 'account'
  | 'preferences'
  | 'import-export'
  | 'help'
  | 'about'
  | 'sync'


type NavItem = { id: AdminSection; label: string; icon: NavIconName }
type NavGroup = { label?: string; items: NavItem[] }

const navGroups: NavGroup[] = [
  { items: [{ id: 'overview', label: '概览', icon: 'overview' }] },
  {
    label: '数据管理',
    items: [
      { id: 'storage', label: '存储文件', icon: 'storage' },
      { id: 'library', label: '我的书签库', icon: 'library' },
      { id: 'categories', label: '分类管理', icon: 'categories' },
      { id: 'trash', label: '回收站', icon: 'trash' },
    ],
  },
  {
    label: '安全管理',
    items: [
      { id: 'app-passwords', label: '密码管理', icon: 'passwords' },
      { id: 'floccus', label: 'Floccus 配置', icon: 'sync' },
      { id: 'backup', label: '数据备份', icon: 'backup' },
      { id: 'devices', label: '设备管理', icon: 'devices' },
    ],
  },
  {
    label: '系统设置',
    items: [
      { id: 'account', label: '账号设置', icon: 'account' },
      { id: 'preferences', label: '偏好设置', icon: 'preferences' },
      { id: 'import-export', label: '导入/导出', icon: 'import-export' },
    ],
  },
  {
    label: '帮助与支持',
    items: [
      { id: 'help', label: '帮助中心', icon: 'help' },
      { id: 'about', label: '关于项目', icon: 'about' },
    ],
  },
]

function allNavItems() {
  return navGroups.flatMap((group) => group.items)
}

function NavIcon({ name, size = 18 }: { name: NavIconName; size?: number }) {
  switch (name) {
    case 'overview':
      return <LayoutDashboard size={size} strokeWidth={1.8} />
    case 'storage':
      return <HardDrive size={size} strokeWidth={1.8} />
    case 'categories':
      return <FolderTree size={size} strokeWidth={1.8} />
    case 'library':
      return <Bookmark size={size} strokeWidth={1.8} />
    case 'trash':
      return <Trash2 size={size} strokeWidth={1.8} />
    case 'passwords':
      return <KeyRound size={size} strokeWidth={1.8} />
    case 'sync':
      return <RefreshCw size={size} strokeWidth={1.8} />
    case 'backup':
      return <Cloud size={size} strokeWidth={1.8} />
    case 'devices':
      return <Laptop size={size} strokeWidth={1.8} />
    case 'account':
      return <User size={size} strokeWidth={1.8} />
    case 'preferences':
      return <Sliders size={size} strokeWidth={1.8} />
    case 'import-export':
      return <ArrowUpDown size={size} strokeWidth={1.8} />
    case 'help':
      return <HelpCircle size={size} strokeWidth={1.8} />
    case 'about':
      return <Info size={size} strokeWidth={1.8} />
    default:
      return <Info size={size} strokeWidth={1.8} />
  }
}

function BrandLogo({ size = 20, src = '/logo.png' }: { size?: number; src?: string }) {
  return (
    <img
      alt="Wotty Bookmark Logo"
      className="brand-logo-img"
      height={size}
      src={src}
      width={size}
    />
  )
}

const SESSION_STORAGE_KEY = 'bookmark-vault.session'

function loadStoredSession(): api.Session | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<api.Session>
    if (!value.token || !value.user?.id || !value.user.loginIdentifier) return null
    return value as api.Session
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY)
    return null
  }
}

function persistSession(session: api.Session | null) {
  try {
    if (session) localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
    else localStorage.removeItem(SESSION_STORAGE_KEY)
  } catch {
    // Private browsing or a storage quota error should not prevent login.
  }
}

function App() {
  const [activeSection, setActiveSection] = useState<AdminSection>(() => loadPreferences().defaultSection as AdminSection)
  const [preferences, setPreferences] = useState<Preferences>(() => loadPreferences())
  const [session, setSession] = useState<api.Session | null>(() => loadStoredSession())

  function handleSessionChange(nextSession: api.Session | null) {
    setSession(nextSession)
    persistSession(nextSession)
  }

  function navigate(section: string) {
    setActiveSection(section as AdminSection)
  }

  function handlePreferencesChange(next: Preferences) {
    setPreferences(next)
    savePreferences(next)
    document.documentElement.dataset.density = next.density
    document.documentElement.classList.toggle('reduce-motion', next.reduceMotion)
  }

  useEffect(() => {
    document.documentElement.dataset.density = preferences.density
    document.documentElement.classList.toggle('reduce-motion', preferences.reduceMotion)
  }, [preferences])

  async function handleLogout() {
    if (session) await api.logout(session.token).catch(() => undefined)
    handleSessionChange(null)
  }

  if (!session) {
    return <LoginCard onLogin={handleSessionChange} />
  }

  const activeLabel = allNavItems().find((item) => item.id === activeSection)?.label ?? '管理后台'
  const isStorageWorkspace = activeSection === 'storage'
  const isCategoryWorkspace = activeSection === 'categories'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark"><BrandLogo size={80} /></span>
        </div>
        <nav className="nav-list" aria-label="管理后台导航">
          {navGroups.map((group, index) => (
            <div className="nav-group" key={group.label ?? `group-${index}`}>
              {group.label && <p className="nav-group-label">{group.label}</p>}
              {group.items.map((item) => (
                <button
                  className={`nav-item ${activeSection === item.id ? 'active' : ''}`}
                  key={item.id}
                  onClick={() => navigate(item.id)}
                  type="button"
                >
                  <span className="nav-icon"><NavIcon name={item.icon} /></span>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user" title={session.user.loginIdentifier}>
            <span className="sidebar-user-avatar">{session.user.loginIdentifier.charAt(0).toUpperCase()}</span>
            <div>
              <strong>管理员</strong>
              <small>{session.user.loginIdentifier}</small>
            </div>
          </div>
          <button className="sidebar-logout" onClick={() => void handleLogout()} type="button">
            <LogOut size={16} strokeWidth={1.8} />
            <span>退出登录</span>
          </button>
        </div>
      </aside>
      <main className={`main-content ${isCategoryWorkspace ? 'category-main-content' : ''}`}>
        <header className="workspace-header">
          <div>
            <p>ADMIN CONSOLE</p>
            <h1>{activeLabel}</h1>
          </div>
          <div className="workspace-service-status">
            <span />
            <div>
              <strong>服务正常</strong>
              <small>管理控制台</small>
            </div>
          </div>
        </header>
        <div className={`workspace-content ${isCategoryWorkspace ? 'category-workspace-content' : ''}`}>
          {isStorageWorkspace ? (
            <StorageFiles token={session.token} onOpenFloccus={() => navigate('floccus')} />
          ) : (
            <>
                {activeSection === 'overview' && <Overview token={session.token} />}
                {activeSection === 'app-passwords' && <AppPasswords token={session.token} />}
                {activeSection === 'categories' && <CategoryManagementPage token={session.token} onOpenFloccus={() => navigate('floccus')} />}
                {activeSection === 'library' && <LibraryManagementPage token={session.token} />}
                {activeSection === 'floccus' && <FloccusGuide token={session.token} loginIdentifier={session.user.loginIdentifier} />}
                {activeSection === 'account' && <AccountSettings loginIdentifier={session.user.loginIdentifier} onOpenAppPasswords={() => navigate('app-passwords')} />}
                {activeSection === 'security' && <Security />}
                {activeSection === 'trash' && <TrashPage navigate={navigate} token={session.token} />}
                {activeSection === 'devices' && <DevicesPage navigate={navigate} onSessionRevoked={() => handleSessionChange(null)} token={session.token} />}
                {activeSection === 'backup' && <BackupPage token={session.token} />}
                {activeSection === 'preferences' && <PreferencesPage onChange={handlePreferencesChange} preferences={preferences} />}
                {activeSection === 'import-export' && <ImportExportPage navigate={navigate} token={session.token} />}
                {activeSection === 'help' && <HelpPage navigate={navigate} token={session.token} />}
                {activeSection === 'about' && <AboutPage />}
                {!['overview', 'app-passwords', 'account', 'categories', 'library', 'floccus', 'security', 'trash', 'devices', 'backup', 'preferences', 'import-export', 'help', 'about'].includes(activeSection) && <ComingSoon label={activeLabel} />}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function LoginCard({ onLogin }: { onLogin: (session: api.Session) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [loginIdentifier, setLoginIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit() {
    setLoading(true)
    setError('')
    try {
      const session = mode === 'login'
        ? await api.login(loginIdentifier, password)
        : await api.register(loginIdentifier, password)
      onLogin(session)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '请求失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand auth-brand"><span className="brand-mark"><BrandLogo size={18} /></span> 书签管理</div>
        <p className="eyebrow">SELF-HOSTED BOOKMARK SYNC</p>
        <h1>管理你的同步服务</h1>
        <p className="muted">登录后台创建 WebDAV 应用密码，然后使用官方 Floccus 同步浏览器书签。</p>
        <label>邮箱或用户名<input value={loginIdentifier} onChange={(event) => setLoginIdentifier(event.target.value)} placeholder="you@example.com" type="text" /></label>
        <label>密码<input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 12 个字符" type="password" /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button" disabled={loading || !loginIdentifier || !password} onClick={() => void submit()} type="button">{loading ? '处理中…' : mode === 'login' ? '登录' : '创建账户'}</button>
        <button className="switch-button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }} type="button">{mode === 'login' ? '还没有账户？创建账户' : '已有账户？返回登录'}</button>
        <p className="form-hint">账户密码只用于登录；Floccus 专用密码会单独生成，不要填写账户密码。</p>
      </section>
    </main>
  )
}

function StorageFiles({ token, onOpenFloccus }: { token: string; onOpenFloccus: () => void }) {
  const [storage, setStorage] = useState<api.StorageStatus | null>(null)
  const [error, setError] = useState('')

  async function loadStorage() {
    setError('')
    try {
      setStorage(await api.getStorageStatus(token))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '读取存储状态失败')
    }
  }

  useEffect(() => { void loadStorage() }, [token])

  return (
    <div className="storage-content">
      <div className="stat-grid">
          <StatCard icon={<RefreshCw size={20} strokeWidth={1.8} />} iconTone="blue" label="同步文件" value={storage ? String(storage.files) : '—'} suffix="个" detail={storage?.lastModifiedAt ? `最近同步 ${formatDate(storage.lastModifiedAt)}` : '尚未同步'} />
          <StatCard icon={<HardDrive size={20} strokeWidth={1.8} />} iconTone="green" label="存储占用" value={storage ? formatBytes(storage.bytes) : '—'} suffix="" detail={storage ? `单文件上限 ${formatBytes(storage.maxFileBytes)}` : '读取中'} />
          <StatCard icon={<KeyRound size={20} strokeWidth={1.8} />} iconTone="purple" label="同步状态" value={storage?.files ? '正常' : '待配置'} suffix="" detail={storage?.lastModifiedAt ? formatDate(storage.lastModifiedAt) : '配置 Floccus 后开始同步'} />
        </div>
        <section className="panel storage-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">ENCRYPTED STORAGE</p><h3>服务器存储摘要</h3></div>
            <span className="storage-encryption-badge">端到端加密</span>
          </div>
          {error ? (
            <div className="empty-state"><span>!</span><h4>无法读取存储状态</h4><p>{error}</p><button className="toolbar-button compact" onClick={() => void loadStorage()} type="button"><RefreshCw size={14} /> 重新连接</button></div>
          ) : storage ? (
            <div className="storage-summary">
              <div className="storage-summary-icon"><HardDrive size={24} strokeWidth={1.8} /></div>
              <div className="storage-summary-content">
                <strong>Floccus 同步数据</strong>
                <p>服务端只保存加密后的同步文件，不解析、不展示书签名称、网址、分类或标签。</p>
                <dl className="storage-details">
                  <div><dt>文件数量</dt><dd>{storage.files} 个</dd></div>
                  <div><dt>占用空间</dt><dd>{formatBytes(storage.bytes)}</dd></div>
                  <div><dt>最近修改</dt><dd>{storage.lastModifiedAt ? formatDate(storage.lastModifiedAt) : '暂无记录'}</dd></div>
                  <div><dt>单文件上限</dt><dd>{formatBytes(storage.maxFileBytes)}</dd></div>
                </dl>
              </div>
            </div>
          ) : (
            <div className="empty-state"><span>…</span><h4>正在读取存储状态</h4><p>请稍候，正在从服务器获取真实数据。</p></div>
          )}
        </section>
        <section className="panel storage-panel">
          <div className="security-notice"><span>i</span><p>为了保护你的隐私，后台不会提供书签明文管理功能。请通过浏览器原生书签和 Floccus 管理书签内容。</p></div>
          <button className="primary-button" onClick={onOpenFloccus} type="button">前往 Floccus 配置</button>
        </section>
      <p className="workspace-note">服务端只保存 Floccus 加密数据 · 书签内容由浏览器和 Floccus 管理</p>
    </div>
  )
}

function StatCard({ icon, iconTone, label, value, suffix, detail, trend }: { icon: React.ReactNode; iconTone: string; label: string; value: string; suffix: string; detail: string; trend?: string }) {
  return <div className="stat-card"><span className={`stat-icon ${iconTone}`}>{icon}</span><div><p>{label}</p><div className="stat-value"><strong>{value}</strong>{suffix && <span>{suffix}</span>}</div><small>{detail}{trend && <em>{trend}</em>}</small></div></div>
}

function Overview({ token }: { token: string }) {
  const [storage, setStorage] = useState<api.StorageStatus | null>(null)
  const [passwordCount, setPasswordCount] = useState<number | null>(null)
  useEffect(() => {
    api.getStorageStatus(token).then(setStorage).catch(() => setStorage(null))
    api.getAppPasswords(token).then((items) => setPasswordCount(items.length)).catch(() => setPasswordCount(null))
  }, [token])

  return (
    <>
      <section className="hero-card">
        <div className="hero-body">
          <div className="hero-badge-wrap">
            <span className="badge">
              <span className="badge-dot" />
              准备就绪
            </span>
          </div>
          <h2>从 Floccus 开始同步你的书签</h2>
          <p>服务器保存 Floccus 加密后的 XBEL 文件；需要后台整理时，可用同一个 passphrase 显式解锁并建立索引。</p>
        </div>
        <div className="hero-symbol-container">
          <div className="hero-symbol-halo" />
          <div className="hero-symbol">
            <RefreshCw size={36} strokeWidth={1.8} />
          </div>
        </div>
      </section>
      <div className="stats-grid">
        <StatCard icon={<RefreshCw size={20} strokeWidth={1.8} />} iconTone="blue" label="同步文件" value={storage ? String(storage.files) : '—'} suffix="个" detail={storage?.lastModifiedAt ? `最近同步 ${formatDate(storage.lastModifiedAt)}` : '尚未配置 Floccus'} />
        <StatCard icon={<HardDrive size={20} strokeWidth={1.8} />} iconTone="green" label="存储占用" value={storage ? formatBytes(storage.bytes) : '—'} suffix="" detail={storage ? `单文件上限 ${formatBytes(storage.maxFileBytes)}` : '读取中'} />
        <StatCard icon={<KeyRound size={20} strokeWidth={1.8} />} iconTone="purple" label="应用密码" value={passwordCount === null ? '—' : String(passwordCount)} suffix="个" detail="建议为每台设备单独创建" />
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">QUICK START</p>
            <h3>三步完成配置</h3>
          </div>
        </div>
        <ol className="steps">
          <li>
            <span className="step-badge">1</span>
            <div>
              <strong>创建应用密码</strong>
              <p>为 Floccus 创建独立凭据，主账户密码不会用于 WebDAV。</p>
            </div>
          </li>
          <li>
            <span className="step-badge">2</span>
            <div>
              <strong>安装官方 Floccus</strong>
              <p>在 Chrome、Edge 或 Firefox 的插件市场安装扩展。</p>
            </div>
          </li>
          <li>
            <span className="step-badge">3</span>
            <div>
              <strong>打开加密同步</strong>
              <p>配置 WebDAV 地址和 passphrase，保护你的书签内容。</p>
            </div>
          </li>
        </ol>
      </section>
    </>
  )
}

function getBookmarkHost(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return value
  }
}

function BookmarkOrganizer({ token, onOpenFloccus, mode = 'organizer' }: { token: string; onOpenFloccus: () => void; mode?: 'organizer' | 'categories' }) {
  const isCategoriesMode = mode === 'categories'
  const [tree, setTree] = useState<api.BookmarkTree | null>(null)
  const [query, setQuery] = useState('')
  const [selectedFolderId, setSelectedFolderId] = useState('all')
  const [targetFolderId, setTargetFolderId] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [moving, setMoving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set())
  const [draggedIds, setDraggedIds] = useState<string[]>([])
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [resettingBaseline, setResettingBaseline] = useState(false)
  const [encryption, setEncryption] = useState<api.EncryptionStatus | null>(null)

  async function loadBookmarks(showLoading = false) {
    if (showLoading) setRefreshing(true)
    setError('')
    try {
      const nextTree = await api.getBookmarks(token)
      setTree(nextTree)
      setSelectedIds((current) => new Set([...current].filter((id) => nextTree.bookmarks.some((bookmark) => bookmark.id === id))))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '书签读取失败')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { void loadBookmarks() }, [token])

  useEffect(() => {
    if (tree?.status === 'encrypted' || tree?.status === 'ready') {
      api.getEncryptionStatus(token).then(setEncryption).catch(() => setEncryption(null))
    }
  }, [token, tree?.status])

  async function unlockEncryptedBookmarks() {
    if (!passphrase || unlocking) return
    setUnlocking(true)
    setError('')
    setNotice('')
    try {
      await api.unlockFloccusEncryption(token, passphrase)
      setPassphrase('')
      setNotice('加密书签已解锁，后台可以整理并继续写回 Floccus 加密文件')
      setEncryption(await api.getEncryptionStatus(token))
      await loadBookmarks()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '加密书签解锁失败')
    } finally {
      setUnlocking(false)
    }
  }

  async function forgetPassphrase() {
    if (unlocking) return
    setUnlocking(true)
    setError('')
    try {
      await api.forgetFloccusPassphrase(token)
      setEncryption(await api.getEncryptionStatus(token))
      setNotice('服务器已移除受保护的 passphrase，并清除了可搜索索引；加密同步文件仍保留')
      await loadBookmarks()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '移除 passphrase 失败')
    } finally {
      setUnlocking(false)
    }
  }

  async function resetEncryptedBaseline() {
    if (resettingBaseline) return
    const confirmed = window.confirm('仅当浏览器本地书签仍完整、但旧 Floccus 加密 Passphrase 已忘记时继续。请先取消同步。旧密文会保留到历史版本，远端基线和服务器旧口令会被移除。继续吗？')
    if (!confirmed) return
    setResettingBaseline(true)
    setError('')
    setNotice('')
    try {
      const result = await api.resetSyncBaseline(token)
      setPassphrase('')
      setNotice(result.backupCreated ? '旧密文已保存到历史版本。请在 Floccus 设置新的 Passphrase，再执行一次“向上推一次”。' : '远端基线已清空。请在 Floccus 设置 Passphrase，再执行一次“向上推一次”。')
      await loadBookmarks()
    } catch (requestError) {
      setError(requestError instanceof api.ApiRequestError && requestError.status === 423 ? 'Floccus 仍在同步，请先取消并等待停止后重试。' : requestError instanceof Error ? requestError.message : '同步基线重建失败')
    } finally {
      setResettingBaseline(false)
    }
  }

  const folders = tree ? flattenFolders(tree.folders) : []
  const visibleCategoryFolders = tree ? visibleFolders(tree.folders, expandedFolderIds) : []
  const selectedFolder = tree && selectedFolderId !== 'all' ? findFolder(tree.folders, selectedFolderId) : null
  const folderIds = selectedFolder ? new Set(descendantFolderIds(selectedFolder)) : null
  const normalizedQuery = query.trim().toLowerCase()
  const visibleBookmarks = (tree?.bookmarks ?? []).filter((bookmark) => {
    const inFolder = !folderIds || (bookmark.parentId ? folderIds.has(bookmark.parentId) : false)
    const searchable = `${bookmark.title} ${bookmark.url} ${bookmark.folderPath}`.toLowerCase()
    return inFolder && (!normalizedQuery || searchable.includes(normalizedQuery))
  })
  const allVisibleSelected = visibleBookmarks.length > 0 && visibleBookmarks.every((bookmark) => selectedIds.has(bookmark.id))
  const isFullPageState = loading || tree?.status !== 'ready'

  function toggleSelection(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (allVisibleSelected) visibleBookmarks.forEach((bookmark) => next.delete(bookmark.id))
      else visibleBookmarks.forEach((bookmark) => next.add(bookmark.id))
      return next
    })
  }

  function handleFolderDragLeave() {
    setDragOverFolderId(null)
  }

  async function moveToFolder(bookmarkIds: string[], parentId: string) {
    if (!tree || tree.status !== 'ready' || moving || bookmarkIds.length === 0) return
    const validIds = [...new Set(bookmarkIds)].filter((id) => tree.bookmarks.some((bookmark) => bookmark.id === id))
    if (validIds.length === 0) return
    const alreadyThere = validIds.every((id) => tree.bookmarks.find((bookmark) => bookmark.id === id)?.parentId === parentId)
    if (alreadyThere) {
      setNotice('所选书签已经位于该文件夹中')
      return
    }
    setMoving(true)
    setError('')
    setNotice('')
    try {
      if (validIds.length === 1) await api.moveBookmark(token, validIds[0], parentId, tree.etag)
      else await api.moveBookmarks(token, validIds, parentId, tree.etag)
      setNotice(`已移动 ${validIds.length} 个书签，等待 Floccus 同步到浏览器`)
      setTargetFolderId('')
      setSelectedIds((current) => new Set([...current].filter((id) => !validIds.includes(id))))
      await loadBookmarks()
    } catch (requestError) {
      try { await loadBookmarks() } catch { /* loadBookmarks stores its own error */ }
      setError(requestError instanceof Error ? requestError.message : '书签移动失败，请刷新后重试')
    } finally {
      setMoving(false)
    }
  }

  async function moveSelected() {
    if (!targetFolderId) return
    await moveToFolder([...selectedIds], targetFolderId)
  }

  function toggleFolderExpanded(folderId: string) {
    setExpandedFolderIds((current) => {
      const next = new Set(current)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }

  function startBookmarkDrag(event: React.DragEvent, bookmarkId: string) {
    if (!isCategoriesMode || moving || !tree || tree.status !== 'ready') return
    const validIds = resolveDraggedBookmarkIds(tree.bookmarks, bookmarkId, selectedIds)
    if (validIds.length === 0) return
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', validIds.join(','))
    setDraggedIds(validIds)
  }

  function handleFolderDragOver(event: React.DragEvent, folderId: string) {
    if (!isCategoriesMode || moving || draggedIds.length === 0) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDragOverFolderId(folderId)
  }

  function handleFolderDrop(event: React.DragEvent, folderId: string) {
    if (!isCategoriesMode || moving) return
    event.preventDefault()
    const rawIds = event.dataTransfer.getData('text/plain').split(',').filter(Boolean)
    const ids = rawIds.length > 0 ? rawIds : draggedIds
    setDragOverFolderId(null)
    setDraggedIds([])
    void moveToFolder(ids, folderId)
  }

  function clearDragState() {
    setDragOverFolderId(null)
    setDraggedIds([])
  }

  return (
    <div className={`bookmark-organizer ${isCategoriesMode ? 'categories-page' : ''} ${isFullPageState ? 'full-page-state' : ''}`}>
      {error && <div className="bookmark-alert error"><strong>读取失败</strong><span>{error}</span></div>}
      {notice && <div className="bookmark-alert success"><strong>操作完成</strong><span>{notice}</span></div>}

      {loading ? (
        <section className="panel bookmark-loading"><span className="bookmark-loading-mark">↔</span><strong>正在读取书签索引…</strong><p>从服务器加载最新的 Floccus 数据。</p></section>
      ) : tree?.status === 'encrypted' ? (
        <section className="panel bookmark-encrypted-state">
          <span className="bookmark-encrypted-icon">◆</span>
          <strong>{encryption?.passphraseStored ? '保存的 Floccus 加密口令已失效' : '输入 Floccus 加密口令解锁后台管理'}</strong>
          <p>新向导创建的配置请填写同一串“Floccus 专用密码”；旧配置请填写当时单独设置的 Passphrase。</p>
          <div className="bookmark-encryption-warning">验证成功后不再是零知识加密：拥有服务器主密钥和数据库的管理员可以解密书签。Floccus 加密口令不会显示在页面或写入日志。</div>
          <div className="bookmark-unlock-form"><input aria-label="Floccus 专用密码或旧配置 Passphrase" autoComplete="current-password" onChange={(event) => setPassphrase(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void unlockEncryptedBookmarks() }} placeholder="Floccus 专用密码 / 旧 Passphrase" type="password" value={passphrase} /><button className="primary-button compact" disabled={!passphrase || unlocking} onClick={() => void unlockEncryptedBookmarks()} type="button">{unlocking ? '验证中…' : '验证并解锁'}</button></div>
          <div className="bookmark-encrypted-actions bookmark-recovery-actions"><button className="toolbar-button compact" onClick={onOpenFloccus} type="button">查看 Floccus 配置</button>{encryption?.passphraseStored && <button className="toolbar-button compact" disabled={unlocking || resettingBaseline} onClick={() => void forgetPassphrase()} type="button">移除已保存口令</button>}<button className="danger-button compact" disabled={unlocking || resettingBaseline} onClick={() => void resetEncryptedBaseline()} type="button">{resettingBaseline ? '正在保存旧密文…' : '忘记旧口令，备份后重建'}</button></div>
          <small className="bookmark-recovery-hint">只有确认浏览器本地书签仍完整、旧 Passphrase 确实找不回时才使用重建。</small>
        </section>
      ) : tree?.status === 'migrationRequired' ? (
        <section className="panel bookmark-encrypted-state">
          <span className="bookmark-encrypted-icon">!</span>
          <strong>需要由浏览器重新建立同步身份</strong>
          <p>当前 XBEL 缺少 Floccus 节点 ID，后台已暂停移动和删除，避免产生大量误删。请在分类管理页面使用快速重建入口，或先在 Floccus 中执行一次“向上推一次”。</p>
          <button className="primary-button compact" onClick={() => void loadBookmarks(true)} type="button">我已推送，重新检查</button>
        </section>
      ) : tree?.status !== 'ready' ? (
        <section className="panel bookmark-empty">
          <span>↔</span>
          <strong>还没有同步文件</strong>
          <p>服务器还没有收到 `bookmarks.xbel`，请先在 Floccus 中完成一次同步。</p>
          <button className="primary-button compact" onClick={onOpenFloccus} type="button">前往 Floccus 配置</button>
        </section>
      ) : (
        <div className="bookmark-workspace">
          <aside className={`panel bookmark-folder-panel ${isCategoriesMode ? 'categories-folder-panel' : ''}`}>
            <div className="bookmark-panel-heading"><div><p className="eyebrow">{isCategoriesMode ? 'CATEGORY TREE' : 'FOLDERS'}</p><h3>{isCategoriesMode ? '组织文件夹' : '书签文件夹'}</h3></div><span>{folders.length}</span></div>
            {isCategoriesMode && <p className="category-panel-hint">将右侧书签拖入左侧文件夹即可归类</p>}
            <button aria-current={selectedFolderId === 'all' ? 'page' : undefined} className={`folder-filter ${selectedFolderId === 'all' ? 'active' : ''}`} onClick={() => setSelectedFolderId('all')} type="button"><span><Home size={15} strokeWidth={1.8} /></span><strong>全部书签</strong><small>{tree.bookmarks.length}</small></button>
            <div className={`folder-tree ${isCategoriesMode ? 'category-folder-tree' : ''}`}>
              {isCategoriesMode ? visibleCategoryFolders.map((folder) => <FolderTreeRow dragOverFolderId={dragOverFolderId} expandedFolderIds={expandedFolderIds} folder={folder} key={folder.id} onDragLeave={handleFolderDragLeave} onDragOver={handleFolderDragOver} onDrop={handleFolderDrop} onSelect={setSelectedFolderId} onToggle={toggleFolderExpanded} selectedFolderId={selectedFolderId} />) : folders.map((folder) => <button className={`folder-filter ${selectedFolderId === folder.id ? 'active' : ''}`} key={folder.id} onClick={() => setSelectedFolderId(folder.id)} style={{ paddingLeft: `${12 + folder.depth * 16}px` }} type="button"><span><Folder size={15} strokeWidth={1.8} /></span><strong>{folder.title}</strong><small>{folder.bookmarkCount}</small></button>)}
            </div>
          </aside>

          <section className="bookmark-results">
            <div className="bookmark-toolbar organizer-toolbar">
              <label className="bookmark-search"><span><Search size={15} strokeWidth={1.8} /></span><input onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、网址或文件夹" type="search" value={query} /></label>
              <button className="toolbar-button" disabled={refreshing} onClick={() => void loadBookmarks(true)} type="button">{refreshing ? '刷新中…' : '刷新'}</button>
              <span className="toolbar-spacer" />
              <span className="bookmark-result-count">显示 {visibleBookmarks.length} / {tree.bookmarks.length}</span>
            </div>

            {selectedIds.size > 0 && <div className="bookmark-bulk-bar"><strong>已选择 {selectedIds.size} 个</strong>{isCategoriesMode && <span className="category-drag-hint">也可以拖动已选书签到左侧文件夹</span>}<select aria-label="移动到文件夹" onChange={(event) => setTargetFolderId(event.target.value)} value={targetFolderId}><option value="">移动到…</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{'　'.repeat(folder.depth)}{folder.title}</option>)}</select><button className="blue-button" disabled={!targetFolderId || moving} onClick={() => void moveSelected()} type="button">{moving ? '移动中…' : '确认移动'}</button><button className="toolbar-button" onClick={() => setSelectedIds(new Set())} type="button">取消选择</button></div>}

            <div className="bookmark-table-shell">
              <div className="bookmark-table-head"><label className="checkbox-wrap"><input checked={allVisibleSelected} onChange={toggleAllVisible} type="checkbox" /><span /></label><span>书签</span><span>网址</span><span>所在文件夹</span><span>操作</span></div>
              {visibleBookmarks.length === 0 ? <div className="bookmark-empty"><span><Search size={22} strokeWidth={1.8} /></span><strong>没有匹配的书签</strong><p>换个关键词，或切换左侧文件夹。</p></div> : visibleBookmarks.map((bookmark, index) => <div className={`bookmark-row ${selectedIds.has(bookmark.id) ? 'selected' : ''} ${isCategoriesMode && draggedIds.includes(bookmark.id) ? 'category-dragging' : ''}`} key={bookmark.id}><label className="checkbox-wrap"><input checked={selectedIds.has(bookmark.id)} onChange={() => toggleSelection(bookmark.id)} type="checkbox" /><span /></label>{isCategoriesMode && <button aria-label={`拖动 ${bookmark.title || bookmark.url}`} className="category-drag-handle" draggable={!moving} onDragEnd={clearDragState} onDragStart={(event) => startBookmarkDrag(event, bookmark.id)} title="拖动到左侧文件夹" type="button">⠿</button>}<div className="bookmark-name"><span className={`site-mark site-mark-${index % 4}`}>{(bookmark.title || '?').charAt(0).toUpperCase()}</span><div><strong title={bookmark.title}>{bookmark.title || '未命名书签'}</strong><span>{getBookmarkHost(bookmark.url)}</span></div></div><a className="bookmark-url-cell" href={bookmark.url} rel="noreferrer" target="_blank" title={bookmark.url}>{bookmark.url}</a><span className="category-pill" title={bookmark.folderPath}>{bookmark.folderPath || '根目录'}</span><a className="bookmark-open-link" href={bookmark.url} rel="noreferrer" target="_blank" title="打开书签" aria-label={`打开 ${bookmark.title || bookmark.url}`}><ExternalLink size={13} strokeWidth={1.8} /></a></div>)}
            </div>
            <p className="bookmark-index-note">书签内容仍由 Floccus 加密同步；此页面使用服务器索引进行查找和整理。</p>
            {encryption?.encryptedFile && encryption.unlocked && <div className="bookmark-key-controls"><span>服务器已解锁 Floccus 加密文件；这不是零知识模式。</span><button className="toolbar-button compact" disabled={unlocking} onClick={() => void forgetPassphrase()} type="button">移除服务器口令</button></div>}
          </section>
        </div>
      )}
    </div>
  )
}

function FolderTreeRow({ folder, selectedFolderId, expandedFolderIds, dragOverFolderId, onSelect, onToggle, onDragOver, onDrop, onDragLeave }: { folder: FlatBookmarkFolder; selectedFolderId: string; expandedFolderIds: Set<string>; dragOverFolderId: string | null; onSelect: (id: string) => void; onToggle: (id: string) => void; onDragOver: (event: React.DragEvent, id: string) => void; onDrop: (event: React.DragEvent, id: string) => void; onDragLeave: () => void }) {
  const hasChildren = folderHasChildren(folder)
  const expanded = expandedFolderIds.has(folder.id)
  return <div className={`category-folder-row ${selectedFolderId === folder.id ? 'active' : ''} ${dragOverFolderId === folder.id ? 'drag-over' : ''}`} style={{ marginLeft: `${folder.depth * 16}px` }} onDragLeave={onDragLeave} onDragOver={(event) => onDragOver(event, folder.id)} onDrop={(event) => onDrop(event, folder.id)}>
    {hasChildren ? <button aria-expanded={expanded} aria-label={expanded ? `折叠 ${folder.title}` : `展开 ${folder.title}`} className="category-folder-toggle" onClick={() => onToggle(folder.id)} type="button">{expanded ? '−' : '+'}</button> : <span className="category-folder-toggle-spacer" />}
    <button aria-current={selectedFolderId === folder.id ? 'page' : undefined} className="category-folder-select" onClick={() => onSelect(folder.id)} type="button"><Folder size={15} strokeWidth={1.8} /><strong>{folder.title}</strong><small>{folder.bookmarkCount}</small></button>
  </div>
}

function formatBytes(bytes: number) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / (1024 * 1024)).toFixed(1)} MB` }
function formatDate(value: string) { return new Date(value).toLocaleString() }
function getWebDavUrl(loginIdentifier: string) { return `${window.location.origin}/dav/${encodeURIComponent(loginIdentifier)}/` }

function AppPasswords({ token }: { token: string }) {
  const [items, setItems] = useState<api.AppPassword[]>([])
  const [name, setName] = useState('')
  const [newSecret, setNewSecret] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  async function loadPasswords() { setLoadError(''); try { setItems(await api.getAppPasswords(token)) } catch (requestError) { setLoadError(requestError instanceof Error ? requestError.message : '读取失败') } }
  useEffect(() => { void loadPasswords() }, [token])
  async function create() { if (!name.trim()) return; try { const item = await api.createAppPassword(token, name.trim()); setItems((current) => [item, ...current]); setNewSecret(item.secret ?? null); setName(''); setError('') } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '创建失败') } }
  async function revoke(id: string) { try { await api.revokeAppPassword(token, id); setItems((current) => current.filter((item) => item.id !== id)); setError('') } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '撤销失败') } }
  return <section className="panel"><div className="panel-heading"><div><p className="eyebrow">ACCESS CONTROL</p><h3>应用密码</h3></div></div><div className="password-create"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：Chrome 工作浏览器" /><button className="primary-button compact" onClick={() => void create()} type="button">创建应用密码</button></div>{error && <p className="form-error">{error}</p>}{newSecret && <div className="secret-box"><strong>请立即保存这串应用密码</strong><code>{newSecret}</code><CopyButton className="ghost-button" value={newSecret} /><p>它只会在创建成功时显示一次。</p></div>}{loadError ? <div className="empty-state"><span>!</span><h4>无法读取应用密码</h4><p>{loadError}</p><button className="toolbar-button compact" onClick={() => void loadPasswords()} type="button"><RefreshCw size={14} /> 重新连接</button></div> : items.length === 0 ? <div className="empty-state"><span>◇</span><h4>还没有应用密码</h4><p>建议为每个浏览器或设备创建独立的应用密码，撤销时不会影响账户登录。</p></div> : <div className="password-list">{items.map((item) => <div className="password-row" key={item.id}><div><strong>{item.name}</strong><span>创建于 {new Date(item.createdAt).toLocaleString()}</span></div><button className="danger-button" onClick={() => void revoke(item.id)} type="button">撤销</button></div>)}</div>}</section>
}

function FloccusGuide({ token, loginIdentifier }: { token: string; loginIdentifier: string }) {
  const davUrl = getWebDavUrl(loginIdentifier)
  const [createdSecret, setCreatedSecret] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [sidebarPairing, setSidebarPairing] = useState<api.SidebarPairing | null>(null)
  const [pairing, setPairing] = useState(false)

  async function handleCreate() {
    setCreating(true)
    setError('')
    try {
      const item = await api.createFloccusCredential(token, 'Floccus 书签同步')
      setCreatedSecret(item.secret ?? null)
    } catch (e) {
      setError(e instanceof api.ApiRequestError && e.code === 'encrypted_baseline_exists'
        ? '服务器仍有旧加密文件。请先到分类管理点击“忘记旧口令，备份后重建”，然后回来创建专用密码。'
        : e instanceof Error ? e.message : '创建失败')
    } finally {
      setCreating(false)
    }
  }

  async function handleSidebarPairing() {
    setPairing(true)
    setError('')
    try {
      const result = await api.createSidebarPairing(token)
      setSidebarPairing(result)
    } catch (pairingError) {
      setError(pairingError instanceof Error ? pairingError.message : '设备码创建失败')
    } finally {
      setPairing(false)
    }
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">CLIENT SETUP</p>
          <h3>Floccus 配置向导</h3>
        </div>
      </div>
      <p className="floccus-intro">先创建一串 Floccus 专用密码，在 WebDAV Password 和 Encryption Passphrase 两处填写同一串。完成同步后，后台会自动建立可管理索引。</p>

      <div className="guide-step-card">
        <div className="guide-step-num">1</div>
        <div className="guide-step-body">
          <h4>创建 Floccus 专用密码</h4>
          <p>这一串同时用于 WebDAV 连接和书签加密。只显示一次，请先复制保存。</p>
          {createdSecret ? (
            <div className="secret-box">
              <strong>复制这一串，后面两处都填它</strong>
              <code>{createdSecret}</code>
              <CopyButton className="ghost-button" value={createdSecret} />
              <p>WebDAV Password = Encryption Passphrase；后台已自动保存受保护副本。</p>
            </div>
          ) : (
            <>
              <button className="primary-button compact" disabled={creating} onClick={() => { void handleCreate() }} type="button">
                {creating ? '创建中…' : '创建 Floccus 专用密码'}
              </button>
              {error && <p className="form-error">{error}</p>}
            </>
          )}
        </div>
      </div>

      <div className="guide-step-card">
        <div className="guide-step-num">2</div>
        <div className="guide-step-body">
          <h4>安装官方 Floccus</h4>
          <p>在浏览器插件市场搜索 <strong>Floccus Bookmarks Sync</strong> 并安装，或点击下方直达链接。</p>
          <div className="browser-links">
            <a className="browser-link-btn" href="https://chromewebstore.google.com/detail/floccus-bookmarks-sync/fnaicdffflnofjppbagibeoednhnbjhg" rel="noreferrer" target="_blank">Chrome 应用商店</a>
            <a className="browser-link-btn" href="https://addons.mozilla.org/firefox/addon/floccus/" rel="noreferrer" target="_blank">Firefox Add-ons</a>
            <a className="browser-link-btn" href="https://microsoftedge.microsoft.com/addons/detail/floccus-bookmarks-sync/gjkddcofhiifldbllobcamllmanombji" rel="noreferrer" target="_blank">Edge 应用商店</a>
          </div>
        </div>
      </div>

      <div className="guide-step-card">
        <div className="guide-step-num">3</div>
        <div className="guide-step-body">
          <h4>在 Floccus 中填写 WebDAV 配置</h4>
          <p>打开 Floccus 设置页，选择 <strong>WebDAV（XBEL）</strong>，依次填入以下字段：</p>
          <div className="config-fields">
            <ConfigField label="WebDAV 地址" value={davUrl} />
            <ConfigField label="用户名" value={loginIdentifier} />
            <ConfigField label="WebDAV Password" value={createdSecret ?? '（请先在上方创建 Floccus 专用密码）'} copyable={Boolean(createdSecret)} />
            <ConfigField label="文件名（Bookmarks file）" value="bookmarks.xbel" />
          </div>
        </div>
      </div>

      <div className="guide-step-card">
        <div className="guide-step-num">4</div>
        <div className="guide-step-body">
          <h4>开启加密，并再次填写同一串</h4>
          <p>在 Floccus 中开启加密，将第一步生成的专用密码粘贴到 Passphrase：</p>
          <div className="config-fields">
            <ConfigField label="Encryption Passphrase" value={createdSecret ?? '（与 WebDAV Password 使用同一串）'} copyable={Boolean(createdSecret)} />
          </div>
          {!createdSecret && (
            <div className="floccus-inline-generate">
              <div>
                <strong>还没有专用密码</strong>
                <span>点击后会生成一串密码，并自动填入上面的 WebDAV Password 和 Encryption Passphrase。</span>
              </div>
              <button className="primary-button compact" disabled={creating} onClick={() => { void handleCreate() }} type="button">
                {creating ? '正在生成…' : '生成并填入专用密码'}
              </button>
            </div>
          )}
          {!createdSecret && error && <p className="form-error floccus-inline-error">{error}</p>}
          <div className="floccus-same-secret-notice">
            <span>✓</span>
            <p><strong>两处填写同一串。</strong>同步完成后不需要再去分类管理验证，服务器会自动解密并建立索引。</p>
          </div>
        </div>
      </div>

      <div className="guide-step-card sidebar-pairing-guide">
        <div className="guide-step-num">↗</div>
        <div className="guide-step-body">
          <h4>连接 WOTTY BOOKMARK 侧边栏</h4>
          <p>生成连接信息后，将 API 地址和设备码分别填入侧边栏，即可读取当前后台书签索引。</p>
          {sidebarPairing ? (
            <div className="secret-box">
              <strong>设备码有效期 10 分钟，只能使用一次</strong>
              <div className="config-fields">
                <ConfigField label="API 地址" value={sidebarPairing.serverUrl} />
                <ConfigField label="设备码" value={sidebarPairing.deviceCode} />
              </div>
            </div>
          ) : (
            <button className="primary-button compact" disabled={pairing} onClick={() => { void handleSidebarPairing() }} type="button">
              {pairing ? '生成中…' : '生成侧边栏设备码'}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

function AccountSettings({ loginIdentifier, onOpenAppPasswords }: { loginIdentifier: string; onOpenAppPasswords: () => void }) {
  const davUrl = getWebDavUrl(loginIdentifier)

  return (
    <div className="account-settings">
      <div className="account-settings-grid">
        <section className="panel account-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">ACCOUNT IDENTITY</p><h3>账号信息</h3></div>
          </div>
          <div className="account-identity-card">
            <div className="account-identity-icon"><NavIcon name="account" /></div>
            <div>
              <strong>{loginIdentifier}</strong>
              <p>登录账号 · WebDAV 用户名</p>
            </div>
          </div>
          <div className="account-details">
            <div><span>账号状态</span><strong className="account-status"><i />正常</strong></div>
            <div><span>登录方式</span><strong>邮箱或用户名</strong></div>
          </div>
        </section>

        <section className="panel account-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">WEBDAV CONNECTION</p><h3>同步连接信息</h3></div>
          </div>
          <p className="account-panel-intro">在 Floccus 中使用下面的地址和用户名。密码请使用应用密码，不要填写登录密码。</p>
          <div className="config-fields">
            <ConfigField label="WebDAV 地址" value={davUrl} />
            <ConfigField label="WebDAV 用户名" value={loginIdentifier} />
          </div>
          <div className="security-notice account-notice">
            <span>i</span>
            <p>WebDAV 地址会随当前访问地址生成。部署到服务器后，这里会自动显示服务器域名。</p>
          </div>
          <button className="primary-button" onClick={onOpenAppPasswords} type="button">去创建应用密码</button>
        </section>
      </div>
    </div>
  )
}

function CopyButton({ className = 'copy-btn', value }: { className?: string; value: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  async function copy() {
    const copied = await copyText(value)
    setState(copied ? 'copied' : 'failed')
    window.setTimeout(() => setState('idle'), 2400)
  }
  const label = state === 'copied' ? '✓ 已复制' : state === 'failed' ? '复制失败' : '复制'
  return <button aria-label={label} className={className} onClick={() => void copy()} title={state === 'failed' ? '浏览器拒绝访问剪贴板，请手动选择文本复制' : '复制'} type="button">{label}</button>
}

function ConfigField({ label, value, copyable = true }: { label: string; value: string; copyable?: boolean }) {
  return (
    <div className="config-field">
      <span className="config-field-label">{label}</span>
      <code className={`config-field-value ${!copyable ? 'config-field-muted' : ''}`}>{value}</code>
      {copyable && (
        <CopyButton value={value} />
      )}
    </div>
  )
}
function GuideStep({ number, title, content }: { number: string; title: string; content: string }) { return <div className="guide-step"><span>{number}</span><div><h4>{title}</h4><p>{content}</p></div></div> }
function Security() { return <section className="panel"><div className="panel-heading"><div><p className="eyebrow">SECURITY</p><h3>账户安全</h3></div></div><div className="security-notice"><span><Shield size={14} strokeWidth={1.8} /></span><p>后台解锁加密书签后，Floccus passphrase 会由服务器主密钥加密保存。页面不会显示口令；移除服务器口令不会删除加密同步文件。</p></div><button className="danger-button" type="button">删除账户</button></section> }
function ComingSoon({ label }: { label: string }) { return <section className="panel coming-soon"><span className="coming-icon"><Sparkles size={24} strokeWidth={1.8} /></span><h3>{label}</h3><p>这个管理模块正在设计中，书签管理和侧边栏会保持独立运行。</p></section> }

export default App
