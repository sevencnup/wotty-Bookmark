import {
  AlertCircle,
  ArchiveRestore,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CloudDownload,
  CloudUpload,
  ExternalLink,
  FileArchive,
  Fingerprint,
  Laptop,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Tag,
  Trash2,
  Upload,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as api from './api'
import { savePreferences, type Preferences } from './preferences'

type Navigate = (section: string) => void

type PageProps = { token: string; navigate: Navigate }

function PageAlert({ children, tone = 'error' }: { children: React.ReactNode; tone?: 'error' | 'success' | 'warning' | 'info' }) {
  return <div className={`page-alert ${tone}`}><AlertCircle size={17} strokeWidth={1.8} /><span>{children}</span></div>
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof api.ApiRequestError) {
    if (error.status === 401) return '登录已过期，请重新登录后再试。'
    if (error.status === 409) return '同步文件已发生变化，请刷新后重试。'
    if (error.status === 423) return 'Floccus 正在同步文件，请稍后再试。'
    if (error.status === 429) return '请求过于频繁，请稍后再试。'
    return error.message
  }
  return error instanceof Error ? error.message : fallback
}

function ConfirmDialog({ title, description, confirmLabel, danger = false, onCancel, onConfirm, loading = false }: { title: string; description: string; confirmLabel: string; danger?: boolean; onCancel: () => void; onConfirm: () => void; loading?: boolean }) {
  return <div className="modal-backdrop" role="presentation"><section aria-labelledby="confirm-title" aria-modal="true" className="admin-modal" role="dialog"><div className="modal-heading"><h2 id="confirm-title">{title}</h2><button aria-label="关闭" className="modal-close" onClick={onCancel} type="button">×</button></div><p className="modal-description">{description}</p><div className="modal-actions"><button className="ghost-button" disabled={loading} onClick={onCancel} type="button">取消</button><button className={danger ? 'danger-button' : 'primary-button'} disabled={loading} onClick={onConfirm} type="button">{loading ? '处理中…' : confirmLabel}</button></div></section></div>
}

export function TrashPage({ token, navigate }: PageProps) {
  const [data, setData] = useState<api.TrashResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirm, setConfirm] = useState<{ kind: 'restore' | 'delete' | 'empty'; id?: string } | null>(null)

  async function load() {
    setError('')
    try { setData(await api.getTrash(token)) } catch (requestError) { setError(errorMessage(requestError, '回收站读取失败')) } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [token])

  async function performConfirm() {
    if (!confirm) return
    setBusyId(confirm.id ?? 'empty')
    setError('')
    try {
      if (confirm.kind === 'restore' && confirm.id) await api.restoreTrashItem(token, confirm.id, null)
      if (confirm.kind === 'delete' && confirm.id) await api.permanentlyDeleteTrashItem(token, confirm.id)
      if (confirm.kind === 'empty') await api.emptyTrash(token)
      setNotice(confirm.kind === 'restore' ? '书签已恢复，等待 Floccus 同步。' : confirm.kind === 'delete' ? '已永久删除回收站记录。' : '回收站已清空。')
      setConfirm(null)
      await load()
    } catch (requestError) { setError(errorMessage(requestError, '操作失败')) } finally { setBusyId(null) }
  }

  const disabled = !data || data.status !== 'ready'
  const isFullPageState = loading || data?.status !== 'ready' || data.items.length === 0
  return <div className={`feature-page ${isFullPageState ? 'full-page-state' : ''}`}>
    {notice && <PageAlert tone="success"><strong>{notice}</strong></PageAlert>}
    {error && <PageAlert>{error}</PageAlert>}
    {loading ? <section className="panel feature-loading"><LoaderCircle className="spin" size={28} /><strong>正在读取回收站…</strong><p>正在确认当前同步文件的可用状态。</p><button className="toolbar-button compact" disabled={loading} onClick={() => void load()} type="button"><RefreshCw size={14} /> 刷新</button></section> : data?.status === 'encrypted' ? <section className="panel capability-state"><ShieldCheck size={28} /><h3>当前同步文件已加密</h3><p>服务器无法解密或识别单个书签，因此不会展示旧索引内容，也不能在这里执行删除和恢复。请在浏览器或 Floccus 中管理书签。</p><div className="inline-actions"><button className="primary-button" onClick={() => navigate('floccus')} type="button">查看 Floccus 配置</button><button className="toolbar-button compact" onClick={() => void load()} type="button"><RefreshCw size={14} /> 刷新</button></div></section> : data?.status !== 'ready' ? <section className="panel capability-state"><ArchiveRestore size={28} /><h3>还没有可管理的书签索引</h3><p>完成一次明文 XBEL 同步后，回收站才可以提供条目级恢复。当前文件状态：{data?.status === 'notReady' ? '等待同步' : '格式待处理'}。</p><div className="inline-actions"><button className="primary-button" onClick={() => navigate('floccus')} type="button">前往同步配置</button><button className="toolbar-button compact" onClick={() => void load()} type="button"><RefreshCw size={14} /> 刷新</button></div></section> : data.items.length === 0 ? <section className="panel feature-empty"><ArchiveRestore size={28} /><h3>回收站是空的</h3><p>从分类管理页移除的书签会显示在这里。</p><div className="inline-actions"><button className="ghost-button" onClick={() => navigate('categories')} type="button">返回分类管理</button><button className="toolbar-button compact" onClick={() => void load()} type="button"><RefreshCw size={14} /> 刷新</button></div></section> : <section className="panel">
      <div className="panel-heading"><div><p className="eyebrow">{data.items.length} ITEMS</p><h3>已删除的书签</h3></div><div className="inline-actions"><button className="toolbar-button compact" disabled={loading} onClick={() => void load()} type="button"><RefreshCw size={14} /> 刷新</button><button className="danger-button" onClick={() => setConfirm({ kind: 'empty' })} type="button"><Trash2 size={14} /> 清空回收站</button></div></div>
      <div className="trash-list">{data.items.map((item) => <article className="trash-item" key={item.id}><div className="trash-item-main"><span className="trash-item-icon"><Trash2 size={17} /></span><div><strong>{item.title || '未命名书签'}</strong><a href={item.url} rel="noreferrer" target="_blank">{item.url}</a><span className="trash-meta">原位置：{item.folderPath || '根目录'} · 删除于 {formatDate(item.deletedAt)}</span></div></div><div className="trash-actions"><button className="ghost-button compact" disabled={busyId !== null || disabled} onClick={() => setConfirm({ kind: 'restore', id: item.id })} type="button"><ArchiveRestore size={14} /> 恢复</button><button aria-label={`永久删除 ${item.title || '未命名书签'}`} className="danger-button compact" disabled={busyId !== null || disabled} onClick={() => setConfirm({ kind: 'delete', id: item.id })} type="button"><Trash2 size={14} /></button></div></article>)}</div>
    </section>}
    {confirm && <ConfirmDialog danger={confirm.kind !== 'restore'} description={confirm.kind === 'restore' ? '书签会恢复到原文件夹；如果原文件夹不存在，将恢复到根目录。' : confirm.kind === 'empty' ? '这会永久删除回收站中的所有记录，且无法恢复。' : '这条回收站记录将被永久删除，当前同步文件不会改变。'} confirmLabel={confirm.kind === 'restore' ? '确认恢复' : '永久删除'} loading={busyId !== null} onCancel={() => setConfirm(null)} onConfirm={() => void performConfirm()} title={confirm.kind === 'restore' ? '恢复书签？' : confirm.kind === 'empty' ? '清空回收站？' : '永久删除？'} />}
  </div>
}

export function TagsPage({ navigate }: PageProps) {
  return <div className="feature-page full-page-state"><section className="panel capability-state tags-state"><span className="capability-icon purple"><Tag size={28} /></span><h3>当前同步模式尚未提供云端标签</h3><p>官方 Floccus 以一个 XBEL 文件同步书签，服务器不会解析客户端加密内容，也没有稳定的跨设备标签数据模型。为了避免标签与书签失去关联，这里不会显示演示数据或提供虚假的云端 CRUD。</p><div className="capability-points"><div><Check size={16} /><span>加密文件不会泄露标签名称</span></div><div><Check size={16} /><span>明文索引目前只包含标题、网址和文件夹</span></div><div><Check size={16} /><span>未来自有客户端协议稳定后再开放跨设备标签</span></div></div><div className="inline-actions"><button className="primary-button" onClick={() => navigate('floccus')} type="button">查看同步配置</button><button className="ghost-button" onClick={() => navigate('help')} type="button">了解加密边界</button></div></section></div>
}

const DEVICE_CLIENT_KEY = 'bookmark-vault.device-client-id'
function getClientId() { let value = localStorage.getItem(DEVICE_CLIENT_KEY); if (!value) { value = crypto.randomUUID(); localStorage.setItem(DEVICE_CLIENT_KEY, value) } return value }

export function DevicesPage({ token, navigate, onSessionRevoked }: PageProps & { onSessionRevoked: () => void }) {
  const [devices, setDevices] = useState<api.Device[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [name] = useState(() => `${navigator.platform || '浏览器'} 管理后台`)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  async function load() {
    setError('')
    try { setDevices(await api.getDevices(token)) } catch (requestError) { setError(errorMessage(requestError, '设备列表读取失败')) } finally { setLoading(false) }
  }
  useEffect(() => {
    void (async () => {
      try { const device = await api.registerDevice(token, { clientId: getClientId(), name, deviceType: 'admin-web' }); setCurrentId(device.id) } catch (requestError) { setError(errorMessage(requestError, '当前设备登记失败')) }
      await load()
    })()
  }, [token])

  async function revoke(id: string) {
    setBusyId(id)
    try { await api.revokeDevice(token, id); setConfirmId(null); if (id === currentId) onSessionRevoked(); else await load() } catch (requestError) { setError(errorMessage(requestError, '设备撤销失败')) } finally { setBusyId(null) }
  }
  return <div className="feature-page">{error && <PageAlert>{error}</PageAlert>}<section className="panel"><div className="panel-heading"><div><p className="eyebrow">WOTTY BOOKMARK CLIENTS</p><h3>已登记设备</h3></div><button className="toolbar-button compact" disabled={loading} onClick={() => void load()} type="button"><RefreshCw size={14} /> 刷新</button></div>{loading ? <div className="feature-loading compact-loading"><LoaderCircle className="spin" size={24} /><span>正在读取设备…</span></div> : devices.length === 0 ? <div className="feature-empty compact-empty"><Laptop size={26} /><h3>还没有登记设备</h3><p>打开后台后，当前浏览器会自动登记为一个设备。</p></div> : <div className="device-list">{devices.map((device) => <article className={`device-card ${device.id === currentId ? 'current' : ''} ${device.revokedAt ? 'revoked' : ''}`} key={device.id}><span className="device-icon"><Laptop size={20} /></span><div className="device-content"><div className="device-title"><strong>{device.name}</strong>{device.id === currentId && <span className="current-badge">当前设备</span>}{device.revokedAt && <span className="revoked-badge">已撤销</span>}</div><p>{device.userAgentSummary || 'WOTTY BOOKMARK 管理后台'} · {device.deviceType}</p><small>最近活动 {formatDate(device.lastSeenAt)} · 登记于 {formatDate(device.createdAt)}</small></div>{!device.revokedAt && <button className="danger-button compact" disabled={busyId !== null || device.id === currentId} onClick={() => setConfirmId(device.id)} type="button">{device.id === currentId ? '当前设备' : '远程撤销'}</button>}</article>)}</div>}</section><section className="panel"><div className="panel-heading"><div><p className="eyebrow">WEBDAV CONNECTIONS</p><h3>应用密码连接</h3></div></div><div className="security-notice"><span>i</span><p>Floccus 不会调用设备登记接口，因此这里的应用密码是连接凭据，不等同于真实设备。你可以在密码管理页按浏览器分别撤销。</p></div><button className="primary-button" onClick={() => navigate('app-passwords')} type="button">管理应用密码</button></section>{confirmId && <ConfirmDialog danger confirmLabel="确认撤销" description="撤销后，该设备关联的后台会话会立即失效，需要重新连接。" loading={busyId !== null} onCancel={() => setConfirmId(null)} onConfirm={() => void revoke(confirmId)} title="撤销这个设备？" />}</div>
}

export function PreferencesPage({ preferences, onChange }: { preferences: Preferences; onChange: (next: Preferences) => void }) {
  function update(patch: Partial<Preferences>) { const next = { ...preferences, ...patch }; onChange(next); savePreferences(next) }
  return <div className="feature-page"><section className="panel settings-panel"><PreferenceSelect label="界面密度" description="调整面板和列表的留白。" value={preferences.density} onChange={(value) => update({ density: value as Preferences['density'] })} options={[['comfortable', '舒适'], ['compact', '紧凑']]} /><PreferenceSelect label="默认打开页面" description="下次打开后台时优先进入的页面。" value={preferences.defaultSection} onChange={(value) => update({ defaultSection: value })} options={[['overview', '概览'], ['storage', '存储文件'], ['categories', '分类管理'], ['devices', '设备管理'], ['import-export', '导入/导出'], ['help', '帮助中心']]} /><PreferenceToggle label="减少界面动效" description="关闭页面过渡和悬停位移动效。" checked={preferences.reduceMotion} onChange={(checked) => update({ reduceMotion: checked })} /><PreferenceToggle label="危险操作始终确认" description="永久删除、清空和撤销操作前显示确认弹窗。" checked={preferences.confirmDangerousActions} onChange={(checked) => update({ confirmDangerousActions: checked })} /></section><section className="panel security-notice"><span><ShieldCheck size={14} /></span><p>不会在偏好设置中保存登录密码、应用密码、Floccus passphrase、书签明文或导入文件。</p></section></div>
}
function PreferenceSelect({ label, description, value, onChange, options }: { label: string; description: string; value: string; onChange: (value: string) => void; options: string[][] }) { return <label className="preference-row"><span><strong>{label}</strong><small>{description}</small></span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([option, text]) => <option key={option} value={option}>{text}</option>)}</select></label> }
function PreferenceToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="preference-row"><span><strong>{label}</strong><small>{description}</small></span><input aria-label={label} checked={checked} className="toggle-input" onChange={(event) => onChange(event.target.checked)} type="checkbox" /></label> }

export function ImportExportPage({ token, navigate }: PageProps) {
  const [storage, setStorage] = useState<api.StorageStatus | null>(null)
  const [versions, setVersions] = useState<api.FileVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'export' | 'import' | 'cleanup' | string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [confirmImport, setConfirmImport] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  async function load() { try { const [nextStorage, nextVersions] = await Promise.all([api.getStorageStatus(token), api.getFileVersions(token)]); setStorage(nextStorage); setVersions(nextVersions) } catch (requestError) { setError(errorMessage(requestError, '导入导出状态读取失败')) } finally { setLoading(false) } }
  useEffect(() => { void load() }, [token])
  async function exportFile() { setBusy('export'); setError(''); try { const blob = await api.exportStorageFile(token); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'bookmarks.xbel'; link.click(); URL.revokeObjectURL(url); setNotice('同步文件已开始下载。') } catch (requestError) { setError(errorMessage(requestError, '导出同步文件失败')) } finally { setBusy(null) } }
  async function importFile() { if (!selectedFile) return; setBusy('import'); setError(''); try { const result = await api.importStorageFile(token, selectedFile); setNotice(result.encrypted ? '加密同步文件已导入，服务器不会读取其内容。' : '明文 XBEL 已导入并建立索引。'); setSelectedFile(null); setConfirmImport(false); if (inputRef.current) inputRef.current.value = ''; await load() } catch (requestError) { setError(errorMessage(requestError, '导入同步文件失败')) } finally { setBusy(null) } }
  async function cleanup() { setBusy('cleanup'); try { const result = await api.cleanupFileVersions(token); setNotice(`已清理 ${result.removed} 个旧版本。`); await load() } catch (requestError) { setError(errorMessage(requestError, '历史版本清理失败')) } finally { setBusy(null) } }
  return <div className="feature-page">{notice && <PageAlert tone="success"><strong>{notice}</strong></PageAlert>}{error && <PageAlert>{error}</PageAlert>}<div className="import-export-grid"><section className="panel transfer-card"><span className="transfer-icon blue"><CloudDownload size={24} /></span><h3>导出同步文件</h3><p>下载当前 `bookmarks.xbel` 原始文件，可用于备份或迁移到另一台服务。</p><dl className="transfer-details"><div><dt>文件大小</dt><dd>{storage ? formatBytes(storage.bytes) : '—'}</dd></div><div><dt>最近修改</dt><dd>{storage?.lastModifiedAt ? formatDate(storage.lastModifiedAt) : '暂无记录'}</dd></div></dl><button className="primary-button" disabled={busy !== null || !storage?.files} onClick={() => void exportFile()} type="button"><CloudDownload size={15} /> {busy === 'export' ? '准备下载…' : '导出 bookmarks.xbel'}</button>{!storage?.files && <small className="form-hint left">当前没有可导出的同步文件。</small>}</section><section className="panel transfer-card"><span className="transfer-icon green"><CloudUpload size={24} /></span><h3>导入同步文件</h3><p>导入前会自动创建当前文件的历史版本。支持明文 XBEL 和 Floccus 加密文件，单文件不超过 10 MB。</p><label className="file-picker"><Upload size={18} /><span>{selectedFile ? `${selectedFile.name} · ${formatBytes(selectedFile.size)}` : '选择 bookmarks.xbel 文件'}</span><input accept=".xbel,.json,application/octet-stream,application/xml,text/xml" ref={inputRef} onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} type="file" /></label><button className="primary-button" disabled={busy !== null || !selectedFile} onClick={() => setConfirmImport(true)} type="button"><CloudUpload size={15} /> 导入并覆盖当前文件</button><small className="form-hint left">不会读取或询问 Floccus passphrase；加密文件须使用原来的 passphrase 才能在客户端打开。</small></section></div><section className="panel"><div className="panel-heading"><div><p className="eyebrow">RECOVERY</p><h3>历史版本</h3></div><div className="inline-actions"><button className="ghost-button compact" disabled={busy !== null || loading} onClick={() => void load()} type="button"><RefreshCw size={14} /> 刷新</button><button className="ghost-button compact" disabled={busy !== null || versions.length === 0} onClick={() => void cleanup()} type="button">清理旧版本</button></div></div>{versions.length === 0 ? <div className="feature-empty compact-empty"><FileArchive size={25} /><h3>还没有历史版本</h3><p>同步文件被覆盖后，系统会自动保留最近的版本。</p></div> : <div className="version-list">{versions.slice(0, 8).map((version) => <div className="version-row" key={version.id}><FileArchive size={17} /><div><strong>{formatBytes(version.byteSize)}</strong><span>{formatDate(version.createdAt)} · {version.filePath}</span></div><button className="ghost-button compact" disabled={busy !== null} onClick={async () => { setBusy(version.id); try { await api.restoreFileVersion(token, version.id); setNotice('历史版本已恢复。'); await load() } catch (requestError) { setError(errorMessage(requestError, '历史版本恢复失败')) } finally { setBusy(null) } }} type="button">恢复</button></div>)}</div>}</section><p className="workspace-note">导入会覆盖当前同步文件，但系统会先保存一个历史版本 · {versions.length} 个可用历史版本</p>{confirmImport && <ConfirmDialog confirmLabel="确认导入" description={`将使用 ${selectedFile?.name ?? '所选文件'} 覆盖当前同步文件，并先创建历史版本。`} loading={busy === 'import'} onCancel={() => setConfirmImport(false)} onConfirm={() => void importFile()} title="导入并覆盖？" />}</div>
}

const helpArticles = [
  { id: 'setup', title: '如何配置 Floccus？', keywords: 'floccus webdav 应用密码 配置同步', content: '先在密码管理页创建应用密码，再在 Floccus 中选择 WebDAV（XBEL），填写后台显示的 WebDAV 地址、登录用户名、应用密码和 bookmarks.xbel。Passphrase 由你自行设置并保存在浏览器中。' },
  { id: 'encryption', title: '为什么后台看不到加密书签？', keywords: '加密 passphrase 隐私 xbel', content: '启用 Floccus 客户端加密后，服务器只收到无法解密的文件。后台不会询问或保存 passphrase，因此不会展示书签标题、网址、文件夹或标签。' },
  { id: 'pairing', title: '侧边栏设备码如何使用？', keywords: '侧边栏 API 地址 设备码 pairing', content: '在 Floccus 配置页生成连接信息，将 API 地址和一次性设备码分别填入 WOTTY BOOKMARK 侧边栏。设备码 10 分钟内有效且只能使用一次，连接后不会保存应用密码或登录密码。' },
  { id: 'versions', title: '如何恢复历史版本？', keywords: '历史版本 恢复 备份 导入导出', content: '每次同步文件被覆盖前，系统会保存一个 opaque 快照。可以在导入/导出页查看并恢复最近版本；恢复前会再次保存当前文件。' },
  { id: 'errors', title: '常见错误状态是什么意思？', keywords: '401 409 422 423 429 错误', content: '401 表示需要重新登录；409 表示文件已被其他同步更新；422 表示文件格式无法识别；423 表示 Floccus 正在持有文件锁；429 表示请求过于频繁。' },
  { id: 'security', title: '服务器会保存哪些数据？', keywords: '安全 隐私 数据 保存 服务器', content: '服务器保存账户和凭据元数据，以及 Floccus 上传的同步文件。启用客户端加密后，服务器不会知道书签标题、URL、文件夹层级、标签和 passphrase。' },
]
export function HelpPage({ navigate }: PageProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>('setup')
  const articles = useMemo(() => { const normalized = query.trim().toLowerCase(); return helpArticles.filter((article) => !normalized || `${article.title} ${article.keywords} ${article.content}`.toLowerCase().includes(normalized)) }, [query])
  return <div className="feature-page"><section className="panel help-search-panel"><label className="help-search"><CircleHelp size={17} /><input onChange={(event) => setQuery(event.target.value)} placeholder="搜索配置、加密、错误码…" type="search" value={query} /></label><div className="help-layout"><aside className="help-topics"><strong>常见主题</strong>{helpArticles.slice(0, 4).map((article) => <button className={open === article.id ? 'active' : ''} key={article.id} onClick={() => setOpen(article.id)} type="button">{article.title}</button>)}</aside><div className="faq-list">{articles.length === 0 ? <div className="feature-empty compact-empty"><CircleHelp size={25} /><h3>没有匹配的帮助内容</h3><p>换一个关键词试试。</p></div> : articles.map((article) => <article className={`faq-item ${open === article.id ? 'open' : ''}`} key={article.id}><button onClick={() => setOpen(open === article.id ? null : article.id)} type="button"><strong>{article.title}</strong>{open === article.id ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</button>{open === article.id && <p>{article.content}</p>}</article>)}</div></div></section><div className="quick-links"><button className="panel-link" onClick={() => navigate('floccus')} type="button"><RefreshCw size={18} /><span><strong>Floccus 配置向导</strong><small>查看 WebDAV 地址和应用密码说明</small></span><ChevronRight size={16} /></button><button className="panel-link" onClick={() => navigate('import-export')} type="button"><CloudUpload size={18} /><span><strong>导入/导出</strong><small>备份或恢复原始同步文件</small></span><ChevronRight size={16} /></button></div></div>
}

export function AboutPage() {
  const [health, setHealth] = useState<api.HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  async function load() { setLoading(true); try { setHealth(await api.getHealth()) } catch { setHealth(null) } finally { setLoading(false) } }
  useEffect(() => { void load() }, [])
  return <div className="feature-page"><section className="about-hero panel"><span className="about-logo"><Fingerprint size={30} /></span><div><h3>WOTTY BOOKMARK</h3><p>让书签同步回到你自己的服务器。后台负责账户、应用密码、设备和存储状态；Floccus 负责浏览器书签同步。</p></div></section><div className="about-grid"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">SERVICE STATUS</p><h3>服务状态</h3></div><div className="inline-actions"><span className={`service-status ${health ? 'online' : 'offline'}`}><i />{loading ? '检查中…' : health ? '运行正常' : '无法连接'}</span><button className="toolbar-button compact" disabled={loading} onClick={() => void load()} type="button"><RefreshCw size={14} /> 刷新状态</button></div></div><dl className="about-details"><div><dt>API 服务</dt><dd>{health?.service ?? '—'}</dd></div><div><dt>API 版本</dt><dd>{health?.version ?? '—'}</dd></div><div><dt>访问地址</dt><dd>{window.location.origin}</dd></div></dl>{!health && !loading && <p className="form-error">无法连接服务，请确认 Rust API 正在运行。</p>}</section><section className="panel"><div className="panel-heading"><div><p className="eyebrow">ARCHITECTURE</p><h3>当前架构</h3></div></div><div className="architecture-list"><div><RefreshCw size={17} /><span><strong>Floccus + WebDAV</strong><small>使用官方客户端同步 XBEL 文件</small></span></div><div><ShieldCheck size={17} /><span><strong>客户端加密</strong><small>服务器不保存 Floccus passphrase</small></span></div><div><Laptop size={17} /><span><strong>浏览器侧边栏</strong><small>只操作当前浏览器的原生书签</small></span></div></div></section></div><section className="panel about-note"><ExternalLink size={17} /><p>WOTTY BOOKMARK 仍在持续开发中。标签、服务端解密和自有同步协议属于后续能力，不会在当前 Floccus 加密模式下伪装成已支持功能。</p></section><p className="workspace-note">管理后台版本 0.1.0 · 当前页面不会收集书签内容</p></div>
}

function formatBytes(bytes: number) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / (1024 * 1024)).toFixed(1)} MB` }
function formatDate(value: string) { return new Date(value).toLocaleString() }
