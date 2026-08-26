import { describe, expect, it } from 'vitest'
import { defaultPreferences, loadPreferences, PREFERENCES_STORAGE_KEY, savePreferences } from './preferences'

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
})
