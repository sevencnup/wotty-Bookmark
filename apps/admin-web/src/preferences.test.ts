import { describe, expect, it } from 'vitest'
import { ACTIVE_SECTION_STORAGE_KEY, confirmDangerousAction, defaultPreferences, loadActiveSection, loadPreferences, PREFERENCES_STORAGE_KEY, saveActiveSection, savePreferences, shouldConfirmDangerousActions } from './preferences'

function storage(initial?: string) {
  const values = new Map<string, string>(initial ? [[PREFERENCES_STORAGE_KEY, initial]] : [])
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } as unknown as Storage
}

describe('admin preferences', () => {
  it('loads defaults when storage is missing or malformed', () => {
    expect(loadPreferences(storage())).toEqual(defaultPreferences)
    expect(loadPreferences(storage('{broken'))).toEqual(defaultPreferences)
    expect(loadPreferences(storage(JSON.stringify({ version: 2 })))).toEqual(defaultPreferences)
  })

  it('normalizes known values and persists a versioned payload', () => {
    const target = storage(JSON.stringify({ version: 1, density: 'wrong', reduceMotion: true }))
    const preferences = loadPreferences(target)
    expect(preferences).toEqual({ ...defaultPreferences, reduceMotion: true })

    savePreferences({ ...preferences, density: 'compact' }, target)
    expect(loadPreferences(target).density).toBe('compact')
  })

  it('falls back when a removed section is stored as the default', () => {
    const target = storage(JSON.stringify({ version: 1, defaultSection: 'audit-log' }))
    expect(loadPreferences(target).defaultSection).toBe('overview')
  })

  it('persists the last valid active section independently from the default preference', () => {
    const target = storage()
    const sections = ['overview', 'library', 'categories']
    expect(loadActiveSection(sections, 'overview', target)).toBe('overview')

    saveActiveSection('library', sections, target)
    expect(target.getItem(ACTIVE_SECTION_STORAGE_KEY)).toBe('library')
    expect(loadActiveSection(sections, 'overview', target)).toBe('library')
    expect(loadActiveSection(['overview', 'categories'], 'overview', target)).toBe('overview')

    saveActiveSection('removed-page', sections, target)
    expect(loadActiveSection(sections, 'overview', target)).toBe('library')
    expect(loadActiveSection(sections, 'removed-page', target)).toBe('library')
    expect(loadActiveSection(['library'], 'removed-page', target)).toBe('library')
  })

  it('uses the dangerous-action preference when deciding whether confirmation is needed', () => {
    const target = storage(JSON.stringify({ version: 1, confirmDangerousActions: false }))
    expect(shouldConfirmDangerousActions(target)).toBe(false)
    expect(confirmDangerousAction('should not open', target)).toBe(true)

    const confirming = storage(JSON.stringify({ version: 1, confirmDangerousActions: true }))
    expect(shouldConfirmDangerousActions(confirming)).toBe(true)
  })
})
