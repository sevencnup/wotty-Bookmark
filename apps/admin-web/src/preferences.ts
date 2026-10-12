import { translateInterfaceText, type Locale } from './i18n'

export const PREFERENCES_STORAGE_KEY = 'bookmark-vault.preferences.v1'
export const ACTIVE_SECTION_STORAGE_KEY = 'bookmark-vault.active-section.v1'

export type Density = 'comfortable' | 'compact'
export type AdminTheme = 'light' | 'dark' | 'warm' | 'custom'

export type Preferences = {
  language: Locale
  density: Density
  defaultSection: string
  reduceMotion: boolean
  confirmDangerousActions: boolean
  theme: AdminTheme
  themeBackgroundImage: string | null
  themeTextColor: string
  themeSurfaceTransparency: number
}

export const defaultPreferences: Preferences = {
  language: 'zh-CN',
  density: 'comfortable',
  defaultSection: 'overview',
  reduceMotion: false,
  confirmDangerousActions: true,
  theme: 'light',
  themeBackgroundImage: null,
  themeTextColor: '#24272E',
  themeSurfaceTransparency: 60,
}

const MAX_BACKGROUND_DATA_URL_LENGTH = 1_450_000
const MAX_BACKGROUND_UPLOAD_SIZE = 20 * 1024 * 1024
const MAX_BACKGROUND_EDGE = 1_920

function isAdminTheme(value: unknown): value is AdminTheme {
  return value === 'light' || value === 'dark' || value === 'warm' || value === 'custom'
}

function isThemeBackground(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= MAX_BACKGROUND_DATA_URL_LENGTH
    && /^data:image\/[a-z0-9.+-]+;base64,/i.test(value)
}

/** Compress uploaded backgrounds so the preference remains safe for localStorage. */
export function optimizeAdminThemeBackground(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) return Promise.reject(new Error('请选择图片文件'))
  if (file.size > MAX_BACKGROUND_UPLOAD_SIZE) return Promise.reject(new Error('背景图片不能超过 20 MB'))

  return new Promise((resolve, reject) => {
    const image = document.createElement('img')
    const sourceUrl = URL.createObjectURL(file)
    const revokeSourceUrl = () => URL.revokeObjectURL(sourceUrl)
    image.onload = () => {
      revokeSourceUrl()
      const longestEdge = Math.max(image.naturalWidth, image.naturalHeight)
      if (!longestEdge) {
        reject(new Error('图片尺寸无效'))
        return
      }
      if (image.naturalWidth * image.naturalHeight > 80_000_000) {
        reject(new Error('图片尺寸过大，请使用分辨率较低的图片'))
        return
      }
      let scale = Math.min(1, MAX_BACKGROUND_EDGE / longestEdge)
      let smallestResult = ''
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
        const context = canvas.getContext('2d')
        if (!context) {
          reject(new Error('浏览器不支持图片处理'))
          return
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        for (const quality of [0.9, 0.8, 0.7, 0.6, 0.5, 0.4]) {
          const dataUrl = canvas.toDataURL('image/webp', quality)
          if (!smallestResult || dataUrl.length < smallestResult.length) smallestResult = dataUrl
          if (isThemeBackground(dataUrl)) {
            resolve(dataUrl)
            return
          }
        }
        scale *= 0.72
      }
      if (isThemeBackground(smallestResult)) {
        resolve(smallestResult)
        return
      }
      reject(new Error('图片无法压缩到可保存的大小'))
    }
    image.onerror = () => {
      revokeSourceUrl()
      reject(new Error('图片读取失败'))
    }
    image.src = sourceUrl
  })
}

export function loadPreferences(storage: Storage | null = typeof window === 'undefined' ? null : window.localStorage): Preferences {
  if (!storage) return { ...defaultPreferences }
  try {
    const raw = storage.getItem(PREFERENCES_STORAGE_KEY)
    if (!raw) return { ...defaultPreferences }
    const value = JSON.parse(raw) as Partial<Preferences> & { version?: number }
    // Older v1 preference payloads omit newer fields; normalize them below.
    if (value.version !== 1) return { ...defaultPreferences }
    const storedDefaultSection = typeof value.defaultSection === 'string' && value.defaultSection
      ? value.defaultSection
      : defaultPreferences.defaultSection
    return {
      language: value.language === 'en' ? 'en' : 'zh-CN',
      density: value.density === 'compact' ? 'compact' : 'comfortable',
      defaultSection: storedDefaultSection === 'bookmark-organizer'
        ? 'categories'
        : storedDefaultSection === 'audit-log'
          ? defaultPreferences.defaultSection
          : storedDefaultSection === 'tags'
            ? defaultPreferences.defaultSection
          : storedDefaultSection,
      reduceMotion: value.reduceMotion === true,
      confirmDangerousActions: value.confirmDangerousActions !== false,
      theme: isAdminTheme(value.theme) && (value.theme !== 'custom' || isThemeBackground(value.themeBackgroundImage))
        ? value.theme
        : 'light',
      themeBackgroundImage: isThemeBackground(value.themeBackgroundImage) ? value.themeBackgroundImage : null,
      themeTextColor: typeof value.themeTextColor === 'string' && /^#[\da-f]{6}$/i.test(value.themeTextColor)
        ? value.themeTextColor.toUpperCase()
        : defaultPreferences.themeTextColor,
      themeSurfaceTransparency: typeof value.themeSurfaceTransparency === 'number' && Number.isFinite(value.themeSurfaceTransparency)
        ? Math.min(100, Math.max(0, Math.round(value.themeSurfaceTransparency)))
        : defaultPreferences.themeSurfaceTransparency,
    }
  } catch {
    return { ...defaultPreferences }
  }
}

export function savePreferences(preferences: Preferences, storage: Storage | null = typeof window === 'undefined' ? null : window.localStorage) {
  if (!storage) return
  try {
    storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ version: 1, ...preferences }))
  } catch {
    // Private browsing or storage quota errors should not block the settings page.
  }
}

/** Apply device theme before React paints, avoiding a light-theme flash on reload. */
export function applyAdminTheme(preferences: Preferences, root: HTMLElement | null = typeof document === 'undefined' ? null : document.documentElement) {
  if (!root) return
  root.dataset.adminTheme = preferences.theme
  root.style.setProperty('--admin-theme-background-image', preferences.themeBackgroundImage ? `url("${preferences.themeBackgroundImage}")` : 'none')
  root.style.setProperty('--admin-theme-text-color', preferences.themeTextColor)
  root.style.setProperty('--admin-theme-surface-opacity', String((100 - preferences.themeSurfaceTransparency) / 100))
}

/** Whether destructive operations should show a confirmation before running. */
export function shouldConfirmDangerousActions(storage: Storage | null = typeof window === 'undefined' ? null : window.localStorage): boolean {
  return loadPreferences(storage).confirmDangerousActions
}

/** Apply the user's dangerous-action preference to a browser confirmation. */
export function confirmDangerousAction(message: string, storage: Storage | null = typeof window === 'undefined' ? null : window.localStorage): boolean {
  if (!shouldConfirmDangerousActions(storage)) return true
  return typeof window === 'undefined' ? true : window.confirm(translateInterfaceText(message, loadPreferences(storage).language))
}

export function loadActiveSection(validSections: readonly string[], fallback: string, storage: Storage | null = typeof window === 'undefined' ? null : window.localStorage): string {
  const safeFallback = validSections.includes(fallback) ? fallback : validSections[0] ?? 'overview'
  if (!storage) return safeFallback
  try {
    const value = storage.getItem(ACTIVE_SECTION_STORAGE_KEY)
    return value && validSections.includes(value) ? value : safeFallback
  } catch {
    return safeFallback
  }
}

export function saveActiveSection(section: string, validSections: readonly string[], storage: Storage | null = typeof window === 'undefined' ? null : window.localStorage) {
  if (!storage || !validSections.includes(section)) return
  try { storage.setItem(ACTIVE_SECTION_STORAGE_KEY, section) } catch { /* optional persistence */ }
}
