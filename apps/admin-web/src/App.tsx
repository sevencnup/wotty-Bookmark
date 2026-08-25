import { useEffect, useState } from 'react'
import type { AdminSection } from '@bookmark-vault/protocol'
import * as api from './api'

const sections: Array<{ id: AdminSection; label: string; icon: string }> = [
  { id: 'overview', label: '概览', icon: '⌂' },
  { id: 'app-passwords', label: '应用密码', icon: '▣' },
  { id: 'floccus', label: 'Floccus 配置', icon: '↔' },
  { id: 'security', label: '账户安全', icon: '◇' },
]

function App() {
  const [activeSection, setActiveSection] = useState<AdminSection>('overview')
  const [sessionToken, setSessionToken] = useState<string | null>(null)

  if (!sessionToken) {
    return <LoginCard onLogin={(session) => setSessionToken(session.token)} />
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">✦</span>
          <span>Bookmark Vault</span>
        </div>
        <p className="sidebar-caption">自部署书签同步</p>
        <nav className="nav-list" aria-label="管理后台导航">
          {sections.map((section) => (
            <button
              className={`nav-item ${activeSection === section.id ? 'active' : ''}`}
              key={section.id}
              onClick={() => setActiveSection(section.id)}
            >
              <span>{section.icon}</span>
              {section.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" /> API 服务待连接
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">BOOKMARK VAULT</p>
            <h1>{sections.find((section) => section.id === activeSection)?.label}</h1>
          </div>
          <button className="ghost-button" onClick={() => setSessionToken(null)}>退出登录</button>
        </header>
        {activeSection === 'overview' && <Overview token={sessionToken} />}
        {activeSection === 'app-passwords' && <AppPasswords token={sessionToken} />}
        {activeSection === 'floccus' && <FloccusGuide />}
        {activeSection === 'security' && <Security />} 
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
        <div className="brand auth-brand"><span className="brand-mark">✦</span> Bookmark Vault</div>
        <p className="eyebrow">SELF-HOSTED BOOKMARK SYNC</p>
        <h1>管理你的同步服务</h1>
        <p className="muted">登录后台创建 WebDAV 应用密码，然后使用官方 Floccus 同步浏览器书签。</p>
        <label>邮箱或用户名<input value={loginIdentifier} onChange={(event) => setLoginIdentifier(event.target.value)} placeholder="you@example.com" type="text" /></label>
        <label>密码<input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 12 个字符" type="password" /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button" disabled={loading || !loginIdentifier || !password} onClick={submit}>{loading ? '处理中…' : mode === 'login' ? '登录' : '创建账户'}</button>
        <button className="switch-button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>{mode === 'login' ? '还没有账户？创建账户' : '已有账户？返回登录'}</button>
        <p className="form-hint">账户密码只用于登录，Floccus passphrase 不会上传到服务器。</p>
      </section>
    </main>
  )
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
        <div>
          <span className="badge">准备就绪</span>
          <h2>从 Floccus 开始同步你的书签</h2>
          <p>服务器只保存 Floccus 加密后的 XBEL 文件，书签内容不会在后台明文展示。</p>
        </div>
        <div className="hero-symbol">↔</div>
      </section>
      <div className="stats-grid">
        <StatCard label="同步文件" value={storage ? String(storage.files) : '—'} detail={storage?.lastModifiedAt ? `最近同步 ${formatDate(storage.lastModifiedAt)}` : '尚未配置 Floccus'} />
        <StatCard label="存储占用" value={storage ? formatBytes(storage.bytes) : '—'} detail={storage ? `单文件上限 ${formatBytes(storage.maxFileBytes)}` : '读取中'} />
        <StatCard label="应用密码" value={passwordCount === null ? '—' : String(passwordCount)} detail="建议为每台设备单独创建" />
      </div>
      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">QUICK START</p><h3>三步完成配置</h3></div></div>
        <ol className="steps">
          <li><span>1</span><div><strong>创建应用密码</strong><p>为 Floccus 创建独立凭据，主账户密码不会用于 WebDAV。</p></div></li>
          <li><span>2</span><div><strong>安装官方 Floccus</strong><p>在 Chrome、Edge 或 Firefox 的插件市场安装。</p></div></li>
          <li><span>3</span><div><strong>打开加密同步</strong><p>配置 WebDAV 地址和 passphrase，保护你的书签内容。</p></div></li>
        </ol>
      </section>
    </>
  )
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="stat-card"><p>{label}</p><strong>{value}</strong><span>{detail}</span></div>
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(value: string) {
  return new Date(value).toLocaleString()
}

function AppPasswords({ token }: { token: string }) {
  const [items, setItems] = useState<api.AppPassword[]>([])
  const [name, setName] = useState('')
  const [newSecret, setNewSecret] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getAppPasswords(token).then(setItems).catch((requestError) => setError(requestError instanceof Error ? requestError.message : '读取失败'))
  }, [token])

  async function create() {
    if (!name.trim()) return
    try {
      const item = await api.createAppPassword(token, name.trim())
      setItems((current) => [item, ...current])
      setNewSecret(item.secret ?? null)
      setName('')
      setError('')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '创建失败')
    }
  }

  async function revoke(id: string) {
    await api.revokeAppPassword(token, id)
    setItems((current) => current.filter((item) => item.id !== id))
  }

  return <section className="panel"><div className="panel-heading"><div><p className="eyebrow">ACCESS CONTROL</p><h3>应用密码</h3></div></div><div className="password-create"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：Chrome 工作浏览器" /><button className="primary-button compact" onClick={create}>创建应用密码</button></div>{error && <p className="form-error">{error}</p>}{newSecret && <div className="secret-box"><strong>请立即保存这串应用密码</strong><code>{newSecret}</code><button className="ghost-button" onClick={() => navigator.clipboard?.writeText(newSecret)}>复制</button><p>它只会在创建成功时显示一次。</p></div>}{items.length === 0 ? <div className="empty-state"><span>◇</span><h4>还没有应用密码</h4><p>建议为每个浏览器或设备创建独立的应用密码，撤销时不会影响账户登录。</p></div> : <div className="password-list">{items.map((item) => <div className="password-row" key={item.id}><div><strong>{item.name}</strong><span>创建于 {new Date(item.createdAt).toLocaleString()}</span></div><button className="danger-button" onClick={() => revoke(item.id)}>撤销</button></div>)}</div>}</section>
}

function FloccusGuide() {
  return <section className="panel"><div className="panel-heading"><div><p className="eyebrow">CLIENT SETUP</p><h3>Floccus 配置向导</h3></div></div><div className="guide-list"><GuideStep number="01" title="准备 WebDAV 地址" content="应用密码创建后，这里会显示专属 WebDAV 地址。" /><GuideStep number="02" title="安装官方 Floccus" content="在浏览器插件市场搜索 Floccus 并安装。" /><GuideStep number="03" title="开启客户端加密" content="在 Floccus 中设置 passphrase。服务器只保存加密后的 XBEL 文件。" /></div></section>
}

function GuideStep({ number, title, content }: { number: string; title: string; content: string }) {
  return <div className="guide-step"><span>{number}</span><div><h4>{title}</h4><p>{content}</p></div></div>
}

function Security() {
  return <section className="panel"><div className="panel-heading"><div><p className="eyebrow">SECURITY</p><h3>账户安全</h3></div></div><div className="security-notice"><span>i</span><p>Bookmark Vault 不保存 Floccus passphrase。忘记 passphrase 后，服务器无法解密或恢复书签内容。</p></div><button className="danger-button">删除账户</button></section>
}

export default App
