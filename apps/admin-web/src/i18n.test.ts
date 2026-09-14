import { describe, expect, it } from 'vitest'
import { translate, translateInterfaceText } from './i18n'

describe('admin interface translations', () => {
  it('provides Chinese and English labels for the language setting', () => {
    expect(translate('zh-CN', 'language')).toBe('界面语言')
    expect(translate('en', 'language')).toBe('Display language')
    expect(translate('en', 'navPreferences')).toBe('Preferences')
  })

  it('translates shared feature-page text and dynamic interface messages to English', () => {
    expect(translateInterfaceText('服务器书签库回收站', 'en')).toBe('Server bookmark library trash')
    expect(translateInterfaceText('已选择 3 个', 'en')).toBe('Selected 3')
    expect(translateInterfaceText('已将 2 个书签移入服务器书签库回收站', 'en')).toBe('Moved 2 bookmarks to the server library trash')
    expect(translateInterfaceText('服务器书签库回收站', 'zh-CN')).toBe('服务器书签库回收站')
  })
})
