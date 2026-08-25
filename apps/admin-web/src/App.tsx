import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import * as api from './api'

type AdminSection =
  | 'overview'
  | 'bookmark-management'
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

type Bookmark = {
  id: string
  title: string
  url: string
  category: string
  tags: string[]
  updatedAt: string
}

type BookmarkDraft = Omit<Bookmark, 'id' | 'updatedAt' | 'tags'> & { tags: string }

const initialBookmarks: Bookmark[] = [
  { id: 'bing', title: '必应搜索', url: 'https://www.bing.com', category: '搜索引擎', tags: ['搜索', '常用'], updatedAt: '2024-05-20 14:30' },
  { id: 'google', title: 'Google', url: 'https://www.google.com', category: '搜索引擎', tags: ['搜索', '常用'], updatedAt: '2024-05-20 14:28' },
  { id: 'github', title: 'GitHub', url: 'https://github.com', category: '开发工具', tags: ['开发', '代码'], updatedAt: '2024-05-19 22:15' },
  { id: 'stackoverflow', title: 'Stack Overflow', url: 'https://stackoverflow.com', category: '开发工具', tags: ['开发', '技术'], updatedAt: '2024-05-19 21:40' },
  { id: 'youtube', title: 'YouTube', url: 'https://www.youtube.com', category: '娱乐网站', tags: ['视频', '娱乐'], updatedAt: '2024-05-18 18:30' },
  { id: 'gmail', title: 'Gmail', url: 'https://mail.google.com', category: '邮箱', tags: ['邮件', '常用'], updatedAt: '2024-05-18 09:15' },
  { id: 'twitter', title: 'Twitter', url: 'https://twitter.com', category: '社交媒体', tags: ['社交', '资讯'], updatedAt: '2024-05-17 16:22' },
  { id: 'taobao', title: '淘宝网', url: 'https://www.taobao.com', category: '购物', tags: ['购物', '生活'], updatedAt: '2024-05-17 11:08' },
]

type NavIconName =
  | 'overview'
  | 'bookmark-management'
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

type NavItem = { id: AdminSection; label: string; icon: NavIconName }
type NavGroup = { label?: string; items: NavItem[] }

const navGroups: NavGroup[] = [
  { items: [{ id: 'overview', label: '概览', icon: 'overview' }] },
  {
    label: '数据管理',
    items: [
      { id: 'bookmark-management', label: '书签管理', icon: 'bookmark-management' },
      { id: 'categories', label: '分类管理', icon: 'categories' },
      { id: 'tags', label: '标签管理', icon: 'tags' },
      { id: 'trash', label: '回收站', icon: 'trash' },
    ],
  },
  {
    label: '安全管理',
    items: [
      { id: 'app-passwords', label: '密码管理', icon: 'passwords' },
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
  'bookmark-management': 'M6 4h12v17l-6-3.5L6 21V4Z',
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
}

function NavIcon({ name }: { name: NavIconName }) {
  return <svg aria-hidden="true" className="nav-svg-icon" fill="none" height="18" viewBox="0 0 24 24" width="18" xmlns="http://www.w3.org/2000/svg"><path d={navIconPaths[name]} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" /></svg>
}

function App() {
  const [activeSection, setActiveSection] = useState<AdminSection>('bookmark-management')
  const [sessionToken, setSessionToken] = useState<string | null>(null)

  if (!sessionToken) {
    return <LoginCard onLogin={(session) => setSessionToken(session.token)} />
  }

  const activeLabel = allNavItems().find((item) => item.id === activeSection)?.label ?? '管理后台'
  const isBookmarkWorkspace = activeSection === 'bookmark-management'

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
      <main className={`main-content ${isBookmarkWorkspace ? 'bookmark-main-content' : ''}`}>
        {isBookmarkWorkspace ? (
          <BookmarkManagement />
        ) : (
          <>
            <header className="topbar">
              <div>
                <p className="eyebrow">BOOKMARK VAULT</p>
                <h1>{activeLabel}</h1>
              </div>
              <button className="ghost-button" onClick={() => setSessionToken(null)} type="button">退出登录</button>
            </header>
            {activeSection === 'overview' && <Overview token={sessionToken} />}
            {activeSection === 'app-passwords' && <AppPasswords token={sessionToken} />}
            {activeSection === 'floccus' && <FloccusGuide />}
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

function BookmarkManagement() {
  const [items, setItems] = useState<Bookmark[]>(initialBookmarks)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('全部')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [editing, setEditing] = useState<Bookmark | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [notice, setNotice] = useState('')

  const categories = useMemo(() => ['全部', ...new Set(items.map((item) => item.category))], [items])
  const filteredItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return items.filter((item) => {
      const matchesCategory = activeCategory === '全部' || item.category === activeCategory
      const matchesQuery = !query || `${item.title} ${item.url} ${item.tags.join(' ')}`.toLocaleLowerCase().includes(query)
      return matchesCategory && matchesQuery
    })
  }, [activeCategory, items, search])
  const totalCount = 148 + items.length - initialBookmarks.length
  const categoryCount = Math.max(12, categories.length - 1)

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3200)
    return () => window.clearTimeout(timer)
  }, [notice])

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((current) => current.size === filteredItems.length ? new Set() : new Set(filteredItems.map((item) => item.id)))
  }

  function removeBookmark(id: string) {
    setItems((current) => current.filter((item) => item.id !== id))
    setSelected((current) => {
      const next = new Set(current)
      next.delete(id)
      return next
    })
    setOpenMenu(null)
    setNotice('书签已移入回收站')
  }

  function saveBookmark(draft: BookmarkDraft) {
    const tags = draft.tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 4)
    if (editing) {
      setItems((current) => current.map((item) => item.id === editing.id ? { ...item, ...draft, tags, updatedAt: '刚刚' } : item))
      setNotice('书签已更新')
    } else {
      setItems((current) => [{ ...draft, tags, id: `bookmark-${Date.now()}`, updatedAt: '刚刚' }, ...current])
      setNotice('书签已创建')
    }
    setEditing(null)
    setShowCreate(false)
  }

  return (
    <>
      <header className="bookmark-topbar">
        <div className="page-heading"><h1>书签管理</h1><span>管理你的所有书签</span></div>
        <label className="global-search"><span>⌕</span><input aria-label="搜索书签、网址、标签" onChange={(event) => setSearch(event.target.value)} placeholder="搜索书签、网址、标签..." type="search" value={search} /></label>
        <button className="account-chip" type="button"><span className="avatar">A</span><span>Admin</span><span className="account-chevron">⌄</span></button>
      </header>

      <div className="bookmark-content">
        <div className="stat-grid">
          <StatCard icon="▮" iconTone="blue" label="全部书签" value={String(totalCount)} suffix="个" detail="较上周" trend="↑ 12%" />
          <StatCard icon="▰" iconTone="green" label="分类数量" value={String(categoryCount)} suffix="个" detail="个分类" />
          <StatCard icon="◆" iconTone="purple" label="标签数量" value="28" suffix="个" detail="个标签" />
          <StatCard icon="◎" iconTone="orange" label="最近添加" value="8" suffix="个" detail="本周" />
        </div>

        <div className="bookmark-toolbar">
          <button className="blue-button" onClick={() => setShowCreate(true)} type="button"><span>＋</span> 新建书签</button>
          <button className="toolbar-button" onClick={() => setNotice('分类管理即将开放')} type="button"><span>□</span> 新建分类</button>
          <button className="toolbar-button" disabled={!selected.size} onClick={() => setNotice(`已选择 ${selected.size} 个书签`)} type="button"><span>⇩</span> 批量操作 <span className="down-caret">⌄</span></button>
          <button className="toolbar-button" onClick={() => setNotice('更多操作即将开放')} type="button">··· 更多操作 <span className="down-caret">⌄</span></button>
          <div className="toolbar-spacer" />
          <div className="view-toggle" aria-label="视图模式">
            <button className={viewMode === 'list' ? 'selected' : ''} onClick={() => setViewMode('list')} title="列表视图" type="button">☷</button>
            <button className={viewMode === 'grid' ? 'selected' : ''} onClick={() => setViewMode('grid')} title="网格视图" type="button">⊞</button>
          </div>
          <label className="filter-button"><span>≡</span><select aria-label="按分类筛选" onChange={(event) => setActiveCategory(event.target.value)} value={activeCategory}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
        </div>

        <div className={`bookmark-table-shell ${viewMode === 'grid' ? 'grid-view' : ''}`}>
          {viewMode === 'list' && <div className="bookmark-table-head"><label className="checkbox-wrap"><input checked={filteredItems.length > 0 && selected.size === filteredItems.length} onChange={toggleAll} type="checkbox" /><span /></label><span>名称⌄</span><span>网址</span><span>分类</span><span>标签</span><span>修改时间</span><span /></div>}
          {filteredItems.length ? filteredItems.map((item) => <BookmarkRow item={item} key={item.id} menuOpen={openMenu === item.id} onDelete={removeBookmark} onEdit={(bookmark) => { setEditing(bookmark); setOpenMenu(null) }} onMenu={() => setOpenMenu((current) => current === item.id ? null : item.id)} onSelect={toggleSelected} selected={selected.has(item.id)} viewMode={viewMode} />) : <div className="bookmark-empty"><span>⌕</span><strong>没有找到匹配的书签</strong><p>尝试更换搜索词或筛选条件。</p></div>}
        </div>

        <div className="bookmark-footer-row"><span>共 {totalCount} 条</span><div className="pagination"><button disabled type="button">‹</button><button className="current" type="button">1</button><button type="button">2</button><button type="button">3</button><button type="button">4</button><button type="button">5</button><span>…</span><button type="button">15</button><button type="button">›</button></div><button className="page-size" type="button">10 条/页⌄</button></div>
        <p className="workspace-note">书签管理系统 © 2024 · 服务端只保存 Floccus 加密数据，书签内容由浏览器和 Floccus 管理</p>
      </div>

      {notice && <div className="admin-toast" role="status">✓ {notice}</div>}
      {(showCreate || editing) && <BookmarkModal bookmark={editing} onClose={() => { setShowCreate(false); setEditing(null) }} onSave={saveBookmark} />}
    </>
  )
}

function StatCard({ icon, iconTone, label, value, suffix, detail, trend }: { icon: string; iconTone: string; label: string; value: string; suffix: string; detail: string; trend?: string }) {
  return <div className="stat-card"><span className={`stat-icon ${iconTone}`}>{icon}</span><div><p>{label}</p><div className="stat-value"><strong>{value}</strong><span>{suffix}</span></div><small>{detail}{trend && <em>{trend}</em>}</small></div></div>
}

function BookmarkRow({ item, selected, menuOpen, viewMode, onSelect, onMenu, onEdit, onDelete }: { item: Bookmark; selected: boolean; menuOpen: boolean; viewMode: 'list' | 'grid'; onSelect: (id: string) => void; onMenu: () => void; onEdit: (item: Bookmark) => void; onDelete: (id: string) => void }) {
  const host = getHostname(item.url)
  return <div className={`bookmark-row ${viewMode === 'grid' ? 'bookmark-card' : ''} ${selected ? 'selected' : ''}`}>
    {viewMode === 'list' ? <label className="checkbox-wrap row-checkbox"><input checked={selected} onChange={() => onSelect(item.id)} type="checkbox" /><span /></label> : <span className="card-mark">{item.title.slice(0, 1)}</span>}
    <div className="bookmark-name"><SiteMark host={host} /><div><strong>{item.title}</strong><span>{item.url}</span></div></div>
    {viewMode === 'list' && <><span className="bookmark-url-cell">{item.url}</span><span className="category-pill">{item.category}</span><span className="tag-list">{item.tags.map((tag) => <em className={`tag tag-${tag.length % 4}`} key={tag}>{tag}</em>)}</span><span className="updated-time">{item.updatedAt}</span></>}
    {viewMode === 'grid' && <div className="grid-card-meta"><span className="category-pill">{item.category}</span><span>{item.tags.join(' · ')}</span></div>}
    <div className="row-menu-wrap"><button aria-label={`操作：${item.title}`} className="row-menu-button" onClick={onMenu} type="button">⋮</button>{menuOpen && <div className="row-menu"><button onClick={() => onEdit(item)} type="button">编辑书签</button><button className="menu-danger" onClick={() => onDelete(item.id)} type="button">移入回收站</button></div>}</div>
  </div>
}

function SiteMark({ host }: { host: string }) {
  const letter = host.replace(/^www\./, '').slice(0, 1).toUpperCase()
  const tone = host.length % 4
  return <span className={`site-mark site-mark-${tone}`}>{letter}</span>
}

function BookmarkModal({ bookmark, onClose, onSave }: { bookmark: Bookmark | null; onClose: () => void; onSave: (draft: BookmarkDraft) => void }) {
  const [draft, setDraft] = useState<BookmarkDraft>({ title: bookmark?.title ?? '', url: bookmark?.url ?? '', category: bookmark?.category ?? '未分类', tags: bookmark?.tags.join(', ') ?? '' })
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (draft.title.trim() && draft.url.trim()) onSave({ ...draft, title: draft.title.trim(), url: draft.url.trim(), category: draft.category.trim() || '未分类' }) }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section aria-labelledby="bookmark-modal-title" className="admin-modal"><div className="modal-heading"><div><p className="eyebrow">{bookmark ? 'EDIT BOOKMARK' : 'NEW BOOKMARK'}</p><h2 id="bookmark-modal-title">{bookmark ? '编辑书签' : '新建书签'}</h2></div><button aria-label="关闭" className="modal-close" onClick={onClose} type="button">×</button></div><form onSubmit={submit}><label>名称<input autoFocus onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="例如：设计灵感" required type="text" value={draft.title} /></label><label>网址<input onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))} placeholder="https://example.com" required type="url" value={draft.url} /></label><label>分类<input onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} placeholder="例如：开发工具" type="text" value={draft.category} /></label><label>标签 <span className="label-hint">用逗号分隔</span><input onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))} placeholder="常用, 工作" type="text" value={draft.tags} /></label><div className="modal-actions"><button className="toolbar-button" onClick={onClose} type="button">取消</button><button className="blue-button" type="submit">{bookmark ? '保存修改' : '创建书签'}</button></div></form></section></div>
}

function getHostname(url: string) {
  try { return new URL(url).hostname }
  catch { return url }
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

function FloccusGuide() { return <section className="panel"><div className="panel-heading"><div><p className="eyebrow">CLIENT SETUP</p><h3>Floccus 配置向导</h3></div></div><div className="guide-list"><GuideStep number="01" title="准备 WebDAV 地址" content="应用密码创建后，这里会显示专属 WebDAV 地址。" /><GuideStep number="02" title="安装官方 Floccus" content="在浏览器插件市场搜索 Floccus 并安装。" /><GuideStep number="03" title="开启客户端加密" content="在 Floccus 中设置 passphrase。服务器只保存加密后的 XBEL 文件。" /></div></section> }
function GuideStep({ number, title, content }: { number: string; title: string; content: string }) { return <div className="guide-step"><span>{number}</span><div><h4>{title}</h4><p>{content}</p></div></div> }
function Security() { return <section className="panel"><div className="panel-heading"><div><p className="eyebrow">SECURITY</p><h3>账户安全</h3></div></div><div className="security-notice"><span>i</span><p>Bookmark Vault 不保存 Floccus passphrase。忘记 passphrase 后，服务器无法解密或恢复书签内容。</p></div><button className="danger-button" type="button">删除账户</button></section> }
function ComingSoon({ label }: { label: string }) { return <section className="panel coming-soon"><span className="coming-icon">✦</span><h3>{label}</h3><p>这个管理模块正在设计中，书签管理和侧边栏会保持独立运行。</p></section> }

export default App
