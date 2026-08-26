import { useEffect, useState } from 'react'
import * as api from './api'

type AdminSection =
  | 'overview'
  | 'storage'
  | 'categories'
  | 'tags'
  | 'trash'
  | 'app-passwords'
  | 'backup'
  | 'devices'
  | 'audit-log'
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
  | 'tags'
  | 'trash'
  | 'passwords'
  | 'backup'
  | 'devices'
  | 'audit-log'
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
      { id: 'categories', label: '分类管理', icon: 'categories' },
      { id: 'tags', label: '标签管理', icon: 'tags' },
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
      { id: 'audit-log', label: '操作日志', icon: 'audit-log' },
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

const navIconPaths: Record<NavIconName, string> = {
  overview: 'M3 10.5 12 3l9 7.5M5.5 9.5V21h13V9.5M9 21v-6h6v6',
  storage: 'M4 5h16v14H4V5Zm4 4h8M8 13h5M8 16h3',
  categories: 'M3 6h7l2 2h9v11H3V6Z',
  tags: 'M4 5h7l8 8-6 6-8-8V5ZM7.5 8.5h.01',
  trash: 'M5 7h14M10 11v5M14 11v5M9 7V4h6v3m-9 0 1 14h10l1-14',
  passwords: 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v10H5V10Zm7 4v2',
  backup: 'M6 18.5h11.5a3.5 3.5 0 0 0 .5-7A6 6 0 0 0 6.5 10 4.5 4.5 0 0 0 6 18.5ZM12 9v8m0 0-3-3m3 3 3-3',
  devices: 'M4 5h16v11H4V5Zm-2 14h20M9 19l1-3h4l1 3',
  'audit-log': 'M6 3h9l3 3v15H6V3Zm9 0v4h3M9 12h6M9 16h4',
  account: 'M19 21a7 7 0 0 0-14 0M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  preferences: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm0-5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.5 1.5M16.5 16.5 18 18M18 6l-1.5 1.5M7.5 16.5 6 18',
  'import-export': 'M12 3v12m0 0-4-4m4 4 4-4M5 18v3h14v-3',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5h.01M9.8 9a2.3 2.3 0 1 1 3.7 1.8c-.9.7-1.5 1.1-1.5 2.2',
  about: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-10v5m0-8h.01',
  sync: 'M4 4v5h5M20 20v-5h-5M4.5 14.5A8.5 8.5 0 0 0 19.5 12M19.5 9.5A8.5 8.5 0 0 0 4.5 12',
}

function NavIcon({ name }: { name: NavIconName }) {
  return <svg aria-hidden="true" className="nav-svg-icon" fill="none" height="18" viewBox="0 0 24 24" width="18" xmlns="http://www.w3.org/2000/svg"><path d={navIconPaths[name]} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" /></svg>
}

function App() {
  const [activeSection, setActiveSection] = useState<AdminSection>('overview')
  const [session, setSession] = useState<api.Session | null>(null)

  if (!session) {
    return <LoginCard onLogin={setSession} />
  }

  const activeLabel = allNavItems().find((item) => item.id === activeSection)?.label ?? '管理后台'
  const isStorageWorkspace = activeSection === 'storage'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">⬡</span>
          <span>书签管理</span>
        </div>
        <nav className="nav-list" aria-label="管理后台导航">
          {navGroups.map((group, index) => (
            <div className="nav-group" key={group.label ?? `group-${index}`}>
              {group.label && <p className="nav-group-label">{group.label}</p>}
              {group.items.map((item) => (
                <button
                  className={`nav-item ${activeSection === item.id ? 'active' : ''}`}
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  type="button"
                >
                  <span className="nav-icon"><NavIcon name={item.icon} /></span>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <main className={`main-content ${isStorageWorkspace ? 'bookmark-main-content' : ''}`}>
        {isStorageWorkspace ? (
          <StorageFiles token={session.token} onOpenFloccus={() => setActiveSection('floccus')} />
        ) : (
          <>
            <header className="topbar">
              <div>
                <p className="eyebrow">BOOKMARK VAULT</p>
                <h1>{activeLabel}</h1>
              </div>
              <button className="ghost-button" onClick={() => setSession(null)} type="button">退出登录</button>
            </header>
            {activeSection === 'overview' && <Overview token={session.token} />}
            {activeSection === 'app-passwords' && <AppPasswords token={session.token} />}
            {activeSection === 'floccus' && <FloccusGuide token={session.token} loginIdentifier={session.user.loginIdentifier} />}
            {activeSection === 'security' && <Security />}
            {!['overview', 'app-passwords', 'floccus', 'security'].includes(activeSection) && <ComingSoon label={activeLabel} />}
          </>
        )}
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
        <div className="brand auth-brand"><span className="brand-mark">⬡</span> 书签管理</div>
        <p className="eyebrow">SELF-HOSTED BOOKMARK SYNC</p>
        <h1>管理你的同步服务</h1>
        <p className="muted">登录后台创建 WebDAV 应用密码，然后使用官方 Floccus 同步浏览器书签。</p>
        <label>邮箱或用户名<input value={loginIdentifier} onChange={(event) => setLoginIdentifier(event.target.value)} placeholder="you@example.com" type="text" /></label>
        <label>密码<input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 12 个字符" type="password" /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button" disabled={loading || !loginIdentifier || !password} onClick={() => void submit()} type="button">{loading ? '处理中…' : mode === 'login' ? '登录' : '创建账户'}</button>
        <button className="switch-button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }} type="button">{mode === 'login' ? '还没有账户？创建账户' : '已有账户？返回登录'}</button>
        <p className="form-hint">账户密码只用于登录，Floccus passphrase 不会上传到服务器。</p>
      </section>
    </main>
  )
}

function StorageFiles({ token, onOpenFloccus }: { token: string; onOpenFloccus: () => void }) {
  const [storage, setStorage] = useState<api.StorageStatus | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getStorageStatus(token).then(setStorage).catch((requestError) => {
      setError(requestError instanceof Error ? requestError.message : '读取存储状态失败')
    })
  }, [token])

  return (
    <>
      <header className="bookmark-topbar">
        <div className="page-heading"><h1>存储文件</h1><span>服务端保存的加密同步数据</span></div>
        <span className="storage-encryption-badge">端到端加密</span>
      </header>
      <div className="bookmark-content">
        <div className="stat-grid">
          <StatCard icon="↔" iconTone="blue" label="同步文件" value={storage ? String(storage.files) : '—'} suffix="个" detail={storage?.lastModifiedAt ? `最近同步 ${formatDate(storage.lastModifiedAt)}` : '尚未同步'} />
          <StatCard icon="▣" iconTone="green" label="存储占用" value={storage ? formatBytes(storage.bytes) : '—'} suffix="" detail={storage ? `单文件上限 ${formatBytes(storage.maxFileBytes)}` : '读取中'} />
          <StatCard icon="◇" iconTone="purple" label="同步状态" value={storage?.files ? '正常' : '待配置'} suffix="" detail={storage?.lastModifiedAt ? formatDate(storage.lastModifiedAt) : '配置 Floccus 后开始同步'} />
        </div>
        <section className="panel storage-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">ENCRYPTED STORAGE</p><h3>服务器存储摘要</h3></div>
          </div>
          {error ? (
            <div className="empty-state"><span>!</span><h4>无法读取存储状态</h4><p>{error}</p></div>
          ) : storage ? (
            <div className="storage-summary">
              <div className="storage-summary-icon">▣</div>
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
    </>
  )
}

function StatCard({ icon, iconTone, label, value, suffix, detail, trend }: { icon: string; iconTone: string; label: string; value: string; suffix: string; detail: string; trend?: string }) {
  return <div className="stat-card"><span className={`stat-icon ${iconTone}`}>{icon}</span><div><p>{label}</p><div className="stat-value"><strong>{value}</strong><span>{suffix}</span></div><small>{detail}{trend && <em>{trend}</em>}</small></div></div>
}

function Overview({ token }: { token: string }) {
  const [storage, setStorage] = useState<api.StorageStatus | null>(null)
  const [passwordCount, setPasswordCount] = useState<number | null>(null)
  useEffect(() => { api.getStorageStatus(token).then(setStorage).catch(() => setStorage(null)); api.getAppPasswords(token).then((items) => setPasswordCount(items.length)).catch(() => setPasswordCount(null)) }, [token])
  return <><section className="hero-card"><div><span className="badge">准备就绪</span><h2>从 Floccus 开始同步你的书签</h2><p>服务器只保存 Floccus 加密后的 XBEL 文件，书签内容不会在后台明文展示。</p></div><div className="hero-symbol">↔</div></section><div className="stats-grid"><StatCard icon="↔" iconTone="blue" label="同步文件" value={storage ? String(storage.files) : '—'} suffix="" detail={storage?.lastModifiedAt ? `最近同步 ${formatDate(storage.lastModifiedAt)}` : '尚未配置 Floccus'} /><StatCard icon="▣" iconTone="green" label="存储占用" value={storage ? formatBytes(storage.bytes) : '—'} suffix="" detail={storage ? `单文件上限 ${formatBytes(storage.maxFileBytes)}` : '读取中'} /><StatCard icon="◇" iconTone="purple" label="应用密码" value={passwordCount === null ? '—' : String(passwordCount)} suffix="" detail="建议为每台设备单独创建" /></div><section className="panel"><div className="panel-heading"><div><p className="eyebrow">QUICK START</p><h3>三步完成配置</h3></div></div><ol className="steps"><li><span>1</span><div><strong>创建应用密码</strong><p>为 Floccus 创建独立凭据，主账户密码不会用于 WebDAV。</p></div></li><li><span>2</span><div><strong>安装官方 Floccus</strong><p>在 Chrome、Edge 或 Firefox 的插件市场安装。</p></div></li><li><span>3</span><div><strong>打开加密同步</strong><p>配置 WebDAV 地址和 passphrase，保护你的书签内容。</p></div></li></ol></section></>
}

function formatBytes(bytes: number) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / (1024 * 1024)).toFixed(1)} MB` }
function formatDate(value: string) { return new Date(value).toLocaleString() }

function AppPasswords({ token }: { token: string }) {
  const [items, setItems] = useState<api.AppPassword[]>([])
  const [name, setName] = useState('')
  const [newSecret, setNewSecret] = useState<string | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { api.getAppPasswords(token).then(setItems).catch((requestError) => setError(requestError instanceof Error ? requestError.message : '读取失败')) }, [token])
  async function create() { if (!name.trim()) return; try { const item = await api.createAppPassword(token, name.trim()); setItems((current) => [item, ...current]); setNewSecret(item.secret ?? null); setName(''); setError('') } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '创建失败') } }
  async function revoke(id: string) { await api.revokeAppPassword(token, id); setItems((current) => current.filter((item) => item.id !== id)) }
  return <section className="panel"><div className="panel-heading"><div><p className="eyebrow">ACCESS CONTROL</p><h3>应用密码</h3></div></div><div className="password-create"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：Chrome 工作浏览器" /><button className="primary-button compact" onClick={() => void create()} type="button">创建应用密码</button></div>{error && <p className="form-error">{error}</p>}{newSecret && <div className="secret-box"><strong>请立即保存这串应用密码</strong><code>{newSecret}</code><button className="ghost-button" onClick={() => navigator.clipboard?.writeText(newSecret)} type="button">复制</button><p>它只会在创建成功时显示一次。</p></div>}{items.length === 0 ? <div className="empty-state"><span>◇</span><h4>还没有应用密码</h4><p>建议为每个浏览器或设备创建独立的应用密码，撤销时不会影响账户登录。</p></div> : <div className="password-list">{items.map((item) => <div className="password-row" key={item.id}><div><strong>{item.name}</strong><span>创建于 {new Date(item.createdAt).toLocaleString()}</span></div><button className="danger-button" onClick={() => void revoke(item.id)} type="button">撤销</button></div>)}</div>}</section>
}

function FloccusGuide({ token, loginIdentifier }: { token: string; loginIdentifier: string }) {
  const davUrl = `${window.location.origin}/dav/${loginIdentifier}/`
  const [passwordName, setPasswordName] = useState('Floccus 书签同步')
  const [createdSecret, setCreatedSecret] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate() {
    if (!passwordName.trim()) return
    setCreating(true)
    setError('')
    try {
      const item = await api.createAppPassword(token, passwordName.trim())
      setCreatedSecret(item.secret ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败')
    } finally {
      setCreating(false)
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
      <p className="floccus-intro">按以下四步完成 Floccus 与 Bookmark Vault 的连接。每台设备建议使用独立的应用密码。</p>

      <div className="guide-step-card">
        <div className="guide-step-num">1</div>
        <div className="guide-step-body">
          <h4>为 Floccus 创建应用密码</h4>
          <p>应用密码只用于 WebDAV 认证，撤销时不影响账号登录。</p>
          {createdSecret ? (
            <div className="secret-box">
              <strong>请立即保存，此密码只显示一次</strong>
              <code>{createdSecret}</code>
              <button className="ghost-button" onClick={() => { void navigator.clipboard?.writeText(createdSecret) }} type="button">复制</button>
            </div>
          ) : (
            <>
              <div className="password-create">
                <input value={passwordName} onChange={(e) => setPasswordName(e.target.value)} placeholder="例如：Chrome 工作浏览器" />
                <button className="primary-button compact" disabled={creating || !passwordName.trim()} onClick={() => { void handleCreate() }} type="button">
                  {creating ? '创建中…' : '创建应用密码'}
                </button>
              </div>
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
            <ConfigField label="应用密码" value={createdSecret ?? '（请先在上方创建应用密码）'} copyable={Boolean(createdSecret)} />
            <ConfigField label="文件名（Bookmarks file）" value="bookmarks.xbel" />
          </div>
        </div>
      </div>

      <div className="guide-step-card">
        <div className="guide-step-num">4</div>
        <div className="guide-step-body">
          <h4>开启客户端加密（强烈推荐）</h4>
          <div className="security-notice">
            <span>!</span>
            <p>在 Floccus 配置页开启 <strong>加密 / passphrase</strong>。服务器只会保存加密后的 XBEL 文件，无法读取书签内容。<strong>passphrase 不上传，丢失后无法找回书签，请妥善保存。</strong></p>
          </div>
        </div>
      </div>
    </section>
  )
}

function ConfigField({ label, value, copyable = true }: { label: string; value: string; copyable?: boolean }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    if (!copyable) return
    void navigator.clipboard?.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="config-field">
      <span className="config-field-label">{label}</span>
      <code className={`config-field-value ${!copyable ? 'config-field-muted' : ''}`}>{value}</code>
      {copyable && (
        <button className="copy-btn" onClick={copy} title="复制" type="button">
          {copied ? '✓ 已复制' : '复制'}
        </button>
      )}
    </div>
  )
}
function GuideStep({ number, title, content }: { number: string; title: string; content: string }) { return <div className="guide-step"><span>{number}</span><div><h4>{title}</h4><p>{content}</p></div></div> }
function Security() { return <section className="panel"><div className="panel-heading"><div><p className="eyebrow">SECURITY</p><h3>账户安全</h3></div></div><div className="security-notice"><span>i</span><p>Bookmark Vault 不保存 Floccus passphrase。忘记 passphrase 后，服务器无法解密或恢复书签内容。</p></div><button className="danger-button" type="button">删除账户</button></section> }
function ComingSoon({ label }: { label: string }) { return <section className="panel coming-soon"><span className="coming-icon">✦</span><h3>{label}</h3><p>这个管理模块正在设计中，书签管理和侧边栏会保持独立运行。</p></section> }

export default App
