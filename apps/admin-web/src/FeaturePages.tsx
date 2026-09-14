import {
  AlertCircle,
  ArchiveRestore,
  Bookmark,
  CalendarClock,
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
  Trash2,
  Upload,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as api from './api'
import { translate, type Locale } from './i18n'
import { confirmDangerousAction, savePreferences, shouldConfirmDangerousActions, type Preferences } from './preferences'
import { browserBookmarksHtmlToXbel } from './browser-bookmarks'

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

  async function performAction(action: { kind: 'restore' | 'delete' | 'empty'; id?: string }) {
    setBusyId(action.id ?? 'empty')
    setError('')
    try {
      if (action.kind === 'restore' && action.id) await api.restoreTrashItem(token, action.id, null)
      if (action.kind === 'delete' && action.id) await api.permanentlyDeleteTrashItem(token, action.id)
      if (action.kind === 'empty') await api.emptyTrash(token)
      setNotice(action.kind === 'restore' ? '书签已恢复，等待 Floccus 同步。' : action.kind === 'delete' ? '已永久删除回收站记录。' : '回收站已清空。')
      setConfirm(null)
      await load()
    } catch (requestError) { setError(errorMessage(requestError, '操作失败')) } finally { setBusyId(null) }
  }

  async function performConfirm() {
    if (confirm) await performAction(confirm)
  }

  function requestTrashAction(action: { kind: 'restore' | 'delete' | 'empty'; id?: string }) {
    if (action.kind === 'restore' || shouldConfirmDangerousActions()) setConfirm(action)
    else void performAction(action)
  }

  const disabled = !data || data.status !== 'ready'
  const isFullPageState = loading || data?.status !== 'ready' || data.items.length === 0
  return <div className={`feature-page ${isFullPageState ? 'full-page-state' : ''}`}>
    {notice && <PageAlert tone="success"><strong>{notice}</strong></PageAlert>}
    {error && <PageAlert>{error}</PageAlert>}
    {loading ? <section className="panel feature-loading"><LoaderCircle className="spin" size={28} /><strong>正在读取回收站…</strong><p>正在确认当前同步文件的可用状态。</p><button className="toolbar-button compact" disabled={loading} onClick={() => void load()} type="button"><RefreshCw size={14} /> 刷新</button></section> : data?.status === 'encrypted' ? <section className="panel capability-state"><ShieldCheck size={28} /><h3>加密文件尚未在后台解锁</h3><p>请先在分类管理页面输入 Floccus passphrase。解锁后，回收站可正常删除和恢复，并继续写回加密文件。</p><div className="inline-actions"><button className="primary-button" onClick={() => navigate('categories')} type="button">前往分类管理解锁</button><button className="toolbar-button compact" onClick={() => void load()} type="button"><RefreshCw size={14} /> 刷新</button></div></section> : data?.status !== 'ready' ? <section className="panel capability-state"><ArchiveRestore size={28} /><h3>还没有可管理的书签索引</h3><p>完成一次 Floccus XBEL 同步并在需要时解锁后，回收站才可以提供条目级恢复。当前文件状态：{data?.status === 'notReady' ? '等待同步' : '格式待处理'}。</p><div className="inline-actions"><button className="primary-button" onClick={() => navigate('floccus')} type="button">前往同步配置</button><button className="toolbar-button compact" onClick={() => void load()} type="button"><RefreshCw size={14} /> 刷新</button></div></section> : data.items.length === 0 ? <section className="panel feature-empty"><ArchiveRestore size={28} /><h3>回收站是空的</h3><p>从分类管理页移除的书签会显示在这里。</p><div className="inline-actions"><button className="ghost-button" onClick={() => navigate('categories')} type="button">返回分类管理</button><button className="toolbar-button compact" onClick={() => void load()} type="button"><RefreshCw size={14} /> 刷新</button></div></section> : <section className="panel">
      <div className="panel-heading"><div><p className="eyebrow">{data.items.length} ITEMS</p><h3>已删除的书签</h3></div><div className="inline-actions"><button className="toolbar-button compact" disabled={loading} onClick={() => void load()} type="button"><RefreshCw size={14} /> 刷新</button><button className="danger-button" onClick={() => requestTrashAction({ kind: 'empty' })} type="button"><Trash2 size={14} /> 清空回收站</button></div></div>
      <div className="trash-list">{data.items.map((item) => <article className="trash-item" key={item.id}><div className="trash-item-main"><span className="trash-item-icon"><Trash2 size={17} /></span><div><strong>{item.title || '未命名书签'}</strong><a href={item.url} rel="noreferrer" target="_blank">{item.url}</a><span className="trash-meta">原位置：{item.folderPath || '根目录'} · 删除于 {formatDate(item.deletedAt)}</span></div></div><div className="trash-actions"><button className="ghost-button compact" disabled={busyId !== null || disabled} onClick={() => requestTrashAction({ kind: 'restore', id: item.id })} type="button"><ArchiveRestore size={14} /> 恢复</button><button aria-label={`永久删除 ${item.title || '未命名书签'}`} className="danger-button compact" disabled={busyId !== null || disabled} onClick={() => requestTrashAction({ kind: 'delete', id: item.id })} type="button"><Trash2 size={14} /></button></div></article>)}</div>
    </section>}
    {confirm && <ConfirmDialog danger={confirm.kind !== 'restore'} description={confirm.kind === 'restore' ? '书签会恢复到原文件夹；如果原文件夹不存在，将恢复到根目录。' : confirm.kind === 'empty' ? '这会永久删除回收站中的所有记录，且无法恢复。' : '这条回收站记录将被永久删除，当前同步文件不会改变。'} confirmLabel={confirm.kind === 'restore' ? '确认恢复' : '永久删除'} loading={busyId !== null} onCancel={() => setConfirm(null)} onConfirm={() => void performConfirm()} title={confirm.kind === 'restore' ? '恢复书签？' : confirm.kind === 'empty' ? '清空回收站？' : '永久删除？'} />}
  </div>
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
  function requestRevoke(id: string) {
    if (shouldConfirmDangerousActions()) setConfirmId(id)
    else void revoke(id)
  }
  return <div className="feature-page">{error && <PageAlert>{error}</PageAlert>}<section className="panel"><div className="panel-heading"><div><p className="eyebrow">WOTTY BOOKMARK CLIENTS</p><h3>已登记设备</h3></div><button className="toolbar-button compact" disabled={loading} onClick={() => void load()} type="button"><RefreshCw size={14} /> 刷新</button></div>{loading ? <div className="feature-loading compact-loading"><LoaderCircle className="spin" size={24} /><span>正在读取设备…</span></div> : devices.length === 0 ? <div className="feature-empty compact-empty"><Laptop size={26} /><h3>还没有登记设备</h3><p>打开后台后，当前浏览器会自动登记为一个设备。</p></div> : <div className="device-list">{devices.map((device) => <article className={`device-card ${device.id === currentId ? 'current' : ''} ${device.revokedAt ? 'revoked' : ''}`} key={device.id}><span className="device-icon"><Laptop size={20} /></span><div className="device-content"><div className="device-title"><strong>{device.name}</strong>{device.id === currentId && <span className="current-badge">当前设备</span>}{device.revokedAt && <span className="revoked-badge">已撤销</span>}</div><p>{device.userAgentSummary || 'WOTTY BOOKMARK 管理后台'} · {device.deviceType}</p><small>最近活动 {formatDate(device.lastSeenAt)} · 登记于 {formatDate(device.createdAt)}</small></div>{!device.revokedAt && <button className="danger-button compact" disabled={busyId !== null || device.id === currentId} onClick={() => requestRevoke(device.id)} type="button">{device.id === currentId ? '当前设备' : '远程撤销'}</button>}</article>)}</div>}</section>{confirmId && <ConfirmDialog danger confirmLabel="确认撤销" description="撤销后，该设备关联的后台会话会立即失效，需要重新连接。" loading={busyId !== null} onCancel={() => setConfirmId(null)} onConfirm={() => void revoke(confirmId)} title="撤销这个设备？" />}</div>
}

export function PreferencesPage({ preferences, onChange }: { preferences: Preferences; onChange: (next: Preferences) => void }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(preferences.language, key)
  function update(patch: Partial<Preferences>) { const next = { ...preferences, ...patch }; onChange(next); savePreferences(next) }
  return <div className="feature-page"><section className="panel settings-panel"><PreferenceSelect label={t('language')} description={t('languageDescription')} value={preferences.language} onChange={(value) => update({ language: value as Locale })} options={[['zh-CN', t('languageChinese')], ['en', t('languageEnglish')]]} /><PreferenceSelect label={t('interfaceDensity')} description={t('interfaceDensityDescription')} value={preferences.density} onChange={(value) => update({ density: value as Preferences['density'] })} options={[['comfortable', t('densityComfortable')], ['compact', t('densityCompact')]]} /><PreferenceSelect label={t('defaultPage')} description={t('defaultPageDescription')} value={preferences.defaultSection} onChange={(value) => update({ defaultSection: value })} options={[['overview', t('navOverview')], ['storage', t('navStorage')], ['categories', t('navCategories')], ['devices', t('navDevices')], ['import-export', t('navImportExport')], ['help', t('navHelp')]]} /><PreferenceToggle label={t('reduceMotion')} description={t('reduceMotionDescription')} checked={preferences.reduceMotion} onChange={(checked) => update({ reduceMotion: checked })} /><PreferenceToggle label={t('confirmDangerousActions')} description={t('confirmDangerousActionsDescription')} checked={preferences.confirmDangerousActions} onChange={(checked) => update({ confirmDangerousActions: checked })} /></section><section className="panel security-notice"><span><ShieldCheck size={14} /></span><p>{t('preferencesSecurityNote')}</p></section></div>
}

export function BackupPage({ token }: { token: string }) {
  const [settings, setSettings] = useState<api.BackupSettings | null>(null)
  const [runs, setRuns] = useState<api.BackupRun[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null)

  async function load() {
    setError('')
    try {
      const [nextSettings, nextRuns] = await Promise.all([api.getBackupSettings(token), api.getBackupRuns(token)])
      setSettings(nextSettings)
      setRuns(nextRuns)
    } catch (requestError) {
      setError(errorMessage(requestError, '备份状态读取失败'))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [token])

  async function save() {
    if (!settings) return
    setSaving(true)
    setError('')
    try {
      setSettings(await api.updateBackupSettings(token, { enabled: settings.enabled, dailyTime: settings.dailyTime, retentionCount: settings.retentionCount }))
      setNotice('备份设置已保存。')
    } catch (requestError) {
      setError(errorMessage(requestError, '备份设置保存失败'))
    } finally {
      setSaving(false)
    }
  }

  async function runNow() {
    setRunning(true)
    setError('')
    try {
      const result = await api.runBackupNow(token)
      setRuns((current) => [result, ...current.filter((run) => run.id !== result.id)])
      setSettings(await api.getBackupSettings(token))
      setNotice('备份已完成：' + formatBytes(result.byteSize) + '。')
    } catch (requestError) {
      setError(errorMessage(requestError, '备份执行失败'))
    } finally {
      setRunning(false)
    }
  }

  async function download(run: api.BackupRun) {
    setError('')
    try {
      const blob = await api.downloadBackup(token, run.backupName)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${run.backupName}.tar.gz`
      link.click()
      URL.revokeObjectURL(url)
      setNotice('备份归档已开始下载。')
    } catch (requestError) { setError(errorMessage(requestError, '备份下载失败')) }
  }

  async function restore(name: string) {
    setRunning(true)
    setError('')
    try {
      const result = await api.restoreBackup(token, name)
      setConfirmRestore(null)
      setNotice(`备份已还原。当前数据已自动保护为 ${result.protectionBackup}；请重启 API 服务使数据库和主密钥完全生效。`)
      await load()
    } catch (requestError) { setError(errorMessage(requestError, '备份还原失败')) } finally { setRunning(false) }
  }

  function requestRestore(name: string) {
    if (shouldConfirmDangerousActions()) setConfirmRestore(name)
    else void restore(name)
  }

  if (loading) return <div className="feature-page full-page-state"><section className="panel feature-loading"><LoaderCircle className="spin" size={28} /><strong>正在读取备份设置…</strong><p>正在检查自动备份状态和最近记录。</p></section></div>
  if (!settings) return <div className="feature-page full-page-state"><section className="panel capability-state"><CloudUpload size={28} /><h3>备份服务暂时无法连接</h3><p>{error || '请稍后重试。'}</p><button className="primary-button" onClick={() => void load()} type="button">重新连接</button></section></div>
  return <div className="feature-page backup-page">
    {notice && <PageAlert tone="success"><strong>{notice}</strong></PageAlert>}
    {error && <PageAlert>{error}</PageAlert>}
    <section className="panel backup-hero-panel">
      <div className="backup-hero-icon"><CloudUpload size={25} /></div>
      <div><p className="eyebrow">SERVER PROTECTION</p><h3>自动备份</h3><p>将数据库、主密钥、同步文件和历史版本保存为一份可迁移的服务器快照。</p></div>
      <span className={'service-status ' + (settings.enabled ? 'online' : 'offline')}><i />{settings.enabled ? '自动备份已开启' : '自动备份已关闭'}</span>
    </section>
    <section className="panel backup-settings-panel">
      <div className="panel-heading"><div><p className="eyebrow">SCHEDULE</p><h3>备份计划</h3></div><button className="primary-button compact" disabled={running} onClick={() => void runNow()} type="button"><CloudUpload size={15} /> {running ? '备份中…' : '立即备份'}</button></div>
      <div className="backup-form-grid">
        <label className="backup-toggle-row"><span><strong>启用每日自动备份</strong><small>按服务器本地时间执行。服务重启后会继续运行。</small></span><input aria-label="启用每日自动备份" checked={settings.enabled} className="toggle-input" onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })} type="checkbox" /></label>
        <label className="backup-input-row"><span><strong>每天执行时间</strong><small>24 小时制，例如 03:00。</small></span><input aria-label="每天执行时间" max="23:59" min="00:00" onChange={(event) => setSettings({ ...settings, dailyTime: event.target.value })} pattern="[0-9]{2}:[0-9]{2}" type="time" value={settings.dailyTime} /></label>
        <label className="backup-input-row"><span><strong>最多保留份数</strong><small>超出后自动删除最旧的备份目录和记录。</small></span><input aria-label="最多保留份数" max="100" min="1" onChange={(event) => setSettings({ ...settings, retentionCount: Number(event.target.value) || 1 })} type="number" value={settings.retentionCount} /></label>
      </div>
      <div className="backup-save-row"><span>{settings.enabled && settings.nextRunAt ? '下一次备份：' + formatDate(settings.nextRunAt) : '关闭后不会执行定时备份。'}</span><button className="ghost-button" disabled={saving} onClick={() => void save()} type="button">{saving ? '保存中…' : '保存设置'}</button></div>
    </section>
    <section className="panel"><div className="panel-heading"><div><p className="eyebrow">BACKUP HISTORY</p><h3>最近备份</h3></div><button className="toolbar-button compact" onClick={() => void load()} type="button"><RefreshCw size={14} /> 刷新</button></div>{runs.length === 0 ? <div className="feature-empty compact-empty"><CalendarClock size={25} /><h3>还没有备份记录</h3><p>点击“立即备份”创建第一份服务器快照。</p></div> : <div className="backup-run-list">{runs.map((run) => <div className="backup-run-row" key={run.id}><span className={'backup-run-status ' + run.status}><i />{run.status === 'success' ? '成功' : run.status === 'running' ? '执行中' : '失败'}</span><div><strong>{run.backupName}</strong><span>{run.completedAt ? formatDate(run.completedAt) : formatDate(run.createdAt)} · {formatBytes(run.byteSize)}</span>{run.errorMessage && <small>{run.errorMessage}</small>}</div>{run.status === 'success' && <div className="inline-actions"><button className="ghost-button compact" disabled={running} onClick={() => void download(run)} type="button"><CloudDownload size={14} /> 下载</button><button className="danger-button compact" disabled={running} onClick={() => requestRestore(run.backupName)} type="button"><ArchiveRestore size={14} /> 还原</button></div>}</div>)}</div>}</section>
    <p className="workspace-note">下载为完整服务器归档，包含数据库、主密钥、同步文件和历史版本。还原会先自动创建当前数据保护备份，并需要重启 API 服务。</p>
    {confirmRestore && <ConfirmDialog danger confirmLabel="确认还原" description={`这会覆盖当前数据库、主密钥、同步文件和历史版本。系统会先自动保护当前数据；还原后必须重启 API 服务。`} loading={running} onCancel={() => setConfirmRestore(null)} onConfirm={() => void restore(confirmRestore)} title={`还原 ${confirmRestore}？`} />}
  </div>
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
  const [confirmVersionRestore, setConfirmVersionRestore] = useState<api.FileVersion | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  async function load() { try { const [nextStorage, nextVersions] = await Promise.all([api.getStorageStatus(token), api.getFileVersions(token)]); setStorage(nextStorage); setVersions(nextVersions) } catch (requestError) { setError(errorMessage(requestError, '导入导出状态读取失败')) } finally { setLoading(false) } }
  useEffect(() => { void load() }, [token])
  async function exportFile() { setBusy('export'); setError(''); try { const blob = await api.exportStorageFile(token); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'bookmarks.xbel'; link.click(); URL.revokeObjectURL(url); setNotice('同步文件已开始下载。') } catch (requestError) { setError(errorMessage(requestError, '导出同步文件失败')) } finally { setBusy(null) } }
  async function importFile() {
    if (!selectedFile) return
    setBusy('import')
    setError('')
    try {
      const source = await selectedFile.text()
      const isHtml = /\.html?$/i.test(selectedFile.name) || selectedFile.type === 'text/html' || /NETSCAPE-Bookmark-file|<DT[^>]*>\s*<H3/i.test(source)
      if (isHtml) {
        const converted = browserBookmarksHtmlToXbel(source)
        if (!converted.count) {
          setError('没有找到可导入的 HTTP/HTTPS 书签，请确认这是浏览器导出的书签 HTML 文件。')
          return
        }
        await api.importLibraryXbel(token, converted.xbel, false)
        setNotice('已导入 ' + converted.count + ' 个浏览器书签到“我的书签库”，不会覆盖 Floccus 同步文件。')
      } else {
        const result = await api.importStorageFile(token, selectedFile)
        setNotice(result.encrypted ? '加密同步文件已导入；若已保存的 passphrase 匹配，索引会自动更新，否则请重新解锁。' : '明文 XBEL 已导入并建立索引。')
      }
      setSelectedFile(null)
      setConfirmImport(false)
      if (inputRef.current) inputRef.current.value = ''
      await load()
    } catch (requestError) { setError(errorMessage(requestError, '导入文件失败')) } finally { setBusy(null) }
  }
  async function cleanup() {
    if (!confirmDangerousAction('清理旧历史版本？被清理的版本将无法再恢复。')) return
    setBusy('cleanup')
    try { const result = await api.cleanupFileVersions(token); setNotice(`已清理 ${result.removed} 个旧版本。`); await load() } catch (requestError) { setError(errorMessage(requestError, '历史版本清理失败')) } finally { setBusy(null) }
  }
  function requestImport() {
    const isHtml = selectedFile && (/\.html?$/i.test(selectedFile.name) || selectedFile.type === 'text/html')
    if (isHtml) void importFile()
    else if (shouldConfirmDangerousActions()) setConfirmImport(true)
    else void importFile()
  }
  function requestVersionRestore(version: api.FileVersion) {
    if (shouldConfirmDangerousActions()) setConfirmVersionRestore(version)
    else void restoreVersion(version)
  }
  async function restoreVersion(version: api.FileVersion) {
    setBusy(version.id)
    try { await api.restoreFileVersion(token, version.id); setConfirmVersionRestore(null); setNotice('历史版本已恢复。'); await load() } catch (requestError) { setError(errorMessage(requestError, '历史版本恢复失败')) } finally { setBusy(null) }
  }
  const selectedIsHtml = Boolean(selectedFile && (/\.html?$/i.test(selectedFile.name) || selectedFile.type === 'text/html'))
  return <div className="feature-page">{notice && <PageAlert tone="success"><strong>{notice}</strong></PageAlert>}{error && <PageAlert>{error}</PageAlert>}<div className="import-export-grid"><section className="panel transfer-card"><span className="transfer-icon blue"><CloudDownload size={24} /></span><h3>导出同步文件</h3><p>下载当前 `bookmarks.xbel` 原始文件，可用于备份或迁移到另一台服务。</p><dl className="transfer-details"><div><dt>文件大小</dt><dd>{storage ? formatBytes(storage.bytes) : '—'}</dd></div><div><dt>最近修改</dt><dd>{storage?.lastModifiedAt ? formatDate(storage.lastModifiedAt) : '暂无记录'}</dd></div></dl><button className="primary-button" disabled={busy !== null || !storage?.files} onClick={() => void exportFile()} type="button"><CloudDownload size={15} /> {busy === 'export' ? '准备下载…' : '导出 bookmarks.xbel'}</button>{!storage?.files && <small className="form-hint left">当前没有可导出的同步文件。</small>}</section><section className="panel transfer-card"><span className="transfer-icon green"><CloudUpload size={24} /></span><h3>导入文件</h3><p>浏览器导出的 HTML 会追加到“我的书签库”；XBEL/JSON 用于导入 Floccus 同步文件。单文件不超过 10 MB。</p><label className="file-picker"><Upload size={18} /><span>{selectedFile ? `${selectedFile.name} · ${formatBytes(selectedFile.size)}` : '选择 HTML、XBEL 或 JSON 文件'}</span><input accept=".html,.htm,.xbel,.json,text/html,application/octet-stream,application/xml,text/xml,application/json" ref={inputRef} onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} type="file" /></label><button className="primary-button" disabled={busy !== null || !selectedFile} onClick={requestImport} type="button"><CloudUpload size={15} /> {selectedIsHtml ? '导入到我的书签库' : '导入并覆盖同步文件'}</button><small className="form-hint left">{selectedIsHtml ? 'HTML 导入会保留文件夹层级，不会修改 Floccus 同步文件。' : 'XBEL/JSON 导入会覆盖当前同步文件，并先创建历史版本；加密文件会尝试使用服务器已保存的 passphrase 建立索引。'}</small></section></div><section className="panel"><div className="panel-heading"><div><p className="eyebrow">RECOVERY</p><h3>历史版本</h3></div><div className="inline-actions"><button className="ghost-button compact" disabled={busy !== null || loading} onClick={() => void load()} type="button"><RefreshCw size={14} /> 刷新</button><button className="ghost-button compact" disabled={busy !== null || versions.length === 0} onClick={() => void cleanup()} type="button">清理旧版本</button></div></div>{versions.length === 0 ? <div className="feature-empty compact-empty"><FileArchive size={25} /><h3>还没有历史版本</h3><p>同步文件被覆盖后，系统会自动保留最近的版本。</p></div> : <div className="version-list">{versions.slice(0, 8).map((version) => <div className="version-row" key={version.id}><FileArchive size={17} /><div><strong>{formatBytes(version.byteSize)}</strong><span>{formatDate(version.createdAt)} · {version.filePath}</span></div><button className="ghost-button compact" disabled={busy !== null} onClick={() => requestVersionRestore(version)} type="button">恢复</button></div>)}</div>}</section><p className="workspace-note">XBEL/JSON 导入会覆盖当前同步文件并先保存历史版本 · {versions.length} 个可用历史版本</p>{confirmImport && <ConfirmDialog confirmLabel="确认导入" description={`将使用 ${selectedFile?.name ?? '所选文件'} 覆盖当前同步文件，并先创建历史版本。`} loading={busy === 'import'} onCancel={() => setConfirmImport(false)} onConfirm={() => void importFile()} title="导入并覆盖？" />}{confirmVersionRestore && <ConfirmDialog danger confirmLabel="确认恢复" description={`恢复 ${confirmVersionRestore.filePath} 会覆盖当前同步文件，并先保留当前版本。`} loading={busy === confirmVersionRestore.id} onCancel={() => setConfirmVersionRestore(null)} onConfirm={() => void restoreVersion(confirmVersionRestore)} title="恢复历史版本？" />}</div>
}

const helpArticles = [
  { id: 'setup', title: '如何连接侧边栏？', keywords: '侧边栏 API 地址 设备码 浏览器名称', content: '进入“侧边栏连接”，填写浏览器名称并生成一次性设备码，然后在 WOTTY BOOKMARK 侧边栏输入 API 地址和设备码。连接码 10 分钟内有效且只能使用一次。' },
  { id: 'encryption', title: '为什么后台能管理加密书签？', keywords: '加密 passphrase 隐私 xbel', content: '专用密码创建时，服务器会同时保存 WebDAV 认证哈希和由主密钥保护的 Passphrase 加密信封。首次同步后可自动建立索引；该模式不属于零知识加密，服务器管理员能够解密书签。旧配置仍使用原来的独立 Passphrase。' },
  { id: 'pairing', title: '侧边栏设备码如何使用？', keywords: '侧边栏 API 地址 设备码 pairing', content: '在“侧边栏连接”页面填写浏览器名称并生成连接信息，将 API 地址和一次性设备码分别填入 WOTTY BOOKMARK 侧边栏。设备码 10 分钟内有效且只能使用一次，连接后不需要应用密码或登录密码。' },
  { id: 'versions', title: '如何恢复历史版本？', keywords: '历史版本 恢复 备份 导入导出', content: '每次同步文件被覆盖前，系统会保存一个 opaque 快照。可以在导入/导出页查看并恢复最近版本；恢复前会再次保存当前文件。' },
  { id: 'errors', title: '常见错误状态是什么意思？', keywords: '401 409 422 423 429 错误', content: '401 表示需要重新登录；409 表示文件已被其他同步更新；422 表示文件格式无法识别；423 表示 Floccus 正在持有文件锁；429 表示请求过于频繁。' },
  { id: 'security', title: '服务器会保存哪些数据？', keywords: '安全 隐私 数据 保存 服务器', content: '服务器保存账户元数据、Floccus 同步文件和可重建的书签索引。若启用后台解锁，还会保存由服务器主密钥加密的 Floccus passphrase；因此该模式不属于零知识加密。' },
]
export function HelpPage({ navigate }: PageProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>('setup')
  const articles = useMemo(() => { const normalized = query.trim().toLowerCase(); return helpArticles.filter((article) => !normalized || `${article.title} ${article.keywords} ${article.content}`.toLowerCase().includes(normalized)) }, [query])
  return <div className="feature-page"><section className="panel help-search-panel"><label className="help-search"><CircleHelp size={17} /><input onChange={(event) => setQuery(event.target.value)} placeholder="搜索配置、加密、错误码…" type="search" value={query} /></label><div className="help-layout"><aside className="help-topics"><strong>常见主题</strong>{helpArticles.slice(0, 4).map((article) => <button className={open === article.id ? 'active' : ''} key={article.id} onClick={() => setOpen(article.id)} type="button">{article.title}</button>)}</aside><div className="faq-list">{articles.length === 0 ? <div className="feature-empty compact-empty"><CircleHelp size={25} /><h3>没有匹配的帮助内容</h3><p>换一个关键词试试。</p></div> : articles.map((article) => <article className={`faq-item ${open === article.id ? 'open' : ''}`} key={article.id}><button onClick={() => setOpen(open === article.id ? null : article.id)} type="button"><strong>{article.title}</strong>{open === article.id ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</button>{open === article.id && <p>{article.content}</p>}</article>)}</div></div></section><div className="quick-links"><button className="panel-link" onClick={() => navigate('floccus')} type="button"><RefreshCw size={18} /><span><strong>Floccus 兼容配置</strong><small>仅用于旧版 WebDAV 同步，侧边栏无需应用密码</small></span><ChevronRight size={16} /></button><button className="panel-link" onClick={() => navigate('import-export')} type="button"><CloudUpload size={18} /><span><strong>导入/导出</strong><small>备份或恢复原始同步文件</small></span><ChevronRight size={16} /></button></div></div>
}

export function AboutPage() {
  const [health, setHealth] = useState<api.HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  async function load() { setLoading(true); try { setHealth(await api.getHealth()) } catch { setHealth(null) } finally { setLoading(false) } }
  useEffect(() => { void load() }, [])
  return <div className="feature-page"><section className="about-hero panel"><span className="about-logo"><Fingerprint size={30} /></span><div><h3>WOTTY BOOKMARK</h3><p>让书签管理回到你自己的服务器。后台负责账户、设备和书签库状态；侧边栏负责日常收藏、整理和访问。</p></div></section><div className="about-grid"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">SERVICE STATUS</p><h3>服务状态</h3></div><div className="inline-actions"><span className={`service-status ${health ? 'online' : 'offline'}`}><i />{loading ? '检查中…' : health ? '运行正常' : '无法连接'}</span><button className="toolbar-button compact" disabled={loading} onClick={() => void load()} type="button"><RefreshCw size={14} /> 刷新状态</button></div></div><dl className="about-details"><div><dt>API 服务</dt><dd>{health?.service ?? '—'}</dd></div><div><dt>API 版本</dt><dd>{health?.version ?? '—'}</dd></div><div><dt>访问地址</dt><dd>{window.location.origin}</dd></div></dl>{!health && !loading && <p className="form-error">无法连接服务，请确认 Rust API 正在运行。</p>}</section><section className="panel"><div className="panel-heading"><div><p className="eyebrow">ARCHITECTURE</p><h3>当前架构</h3></div></div><div className="architecture-list"><div><Bookmark size={17} /><span><strong>服务器书签库</strong><small>书签数据保存在自有服务器并跨浏览器使用</small></span></div><div><ShieldCheck size={17} /><span><strong>一次性设备码</strong><small>每个浏览器单独命名并绑定设备会话</small></span></div><div><Laptop size={17} /><span><strong>浏览器侧边栏</strong><small>直接操作服务器书签，不读取浏览器原生书签</small></span></div></div></section></div><section className="panel about-note"><ExternalLink size={17} /><p>Floccus 配置仍作为隐藏兼容页面保留；新浏览器推荐使用“侧边栏连接”建立服务器书签库连接。</p></section><p className="workspace-note">管理后台版本 0.1.0 · 当前页面不会收集书签内容</p></div>
}

function formatBytes(bytes: number) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / (1024 * 1024)).toFixed(1)} MB` }
function formatDate(value: string) { return new Date(value).toLocaleString() }
