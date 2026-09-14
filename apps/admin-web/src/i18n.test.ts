import { describe, expect, it } from 'vitest'
import { translate } from './i18n'

describe('admin interface translations', () => {
  it('provides Chinese and English labels for the language setting', () => {
    expect(translate('zh-CN', 'language')).toBe('界面语言')
    expect(translate('en', 'language')).toBe('Display language')
    expect(translate('en', 'navPreferences')).toBe('Preferences')
  })
})
