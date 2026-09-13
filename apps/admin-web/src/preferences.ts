export const PREFERENCES_STORAGE_KEY = 'bookmark-vault.preferences.v1'
export const ACTIVE_SECTION_STORAGE_KEY = 'bookmark-vault.active-section.v1'

export type Density = 'comfortable' | 'compact'

export type Preferences = {
  density: Density
  defaultSection: string
  reduceMotion: boolean
  confirmDangerousActions: boolean
}

export const defaultPreferences: Preferences = {
  density: 'comfortable',
  defaultSection: 'overview',
  reduceMotion: false,
  confirmDangerousActions: true,
}

export function loadPreferences(storage: Storage | null = typeof window === 'undefined' ? null : window.localStorage): Preferences {
  if (!storage) return { ...defaultPreferences }
  try {
    const raw = storage.getItem(PREFERENCES_STORAGE_KEY)
    if (!raw) return { ...defaultPreferences }
    const value = JSON.parse(raw) as Partial<Preferences> & { version?: number }
    if (value.version !== 1) return { ...defaultPreferences }
    const storedDefaultSection = typeof value.defaultSection === 'string' && value.defaultSection
      ? value.defaultSection
      : defaultPreferences.defaultSection
    return {
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

/** Whether destructive operations should show a confirmation before running. */
export function shouldConfirmDangerousActions(storage: Storage | null = typeof window === 'undefined' ? null : window.localStorage): boolean {
  return loadPreferences(storage).confirmDangerousActions
}

/** Apply the user's dangerous-action preference to a browser confirmation. */
export function confirmDangerousAction(message: string, storage: Storage | null = typeof window === 'undefined' ? null : window.localStorage): boolean {
  if (!shouldConfirmDangerousActions(storage)) return true
  return typeof window === 'undefined' ? true : window.confirm(message)
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
