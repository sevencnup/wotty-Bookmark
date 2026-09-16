import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('admin site icon presentation', () => {
  it('keeps library and category domain icons free of outer card borders', () => {
    const libraryStyles = readFileSync(resolve(import.meta.dirname, 'feature-pages.css'), 'utf8')
    const categoryStyles = readFileSync(resolve(import.meta.dirname, 'styles.css'), 'utf8')

    expect(libraryStyles).toMatch(/\.library-site-icon\s*\{[\s\S]*border:\s*0;[\s\S]*background:\s*transparent;/)
    expect(libraryStyles).toMatch(/\.library-site-icon\.is-fallback\s*\{[\s\S]*background:\s*transparent;/)
    expect(categoryStyles).toMatch(/\.category-bookmark-info \.library-site-icon\s*\{[\s\S]*border:\s*0;[\s\S]*background:\s*transparent;/)
  })
})
