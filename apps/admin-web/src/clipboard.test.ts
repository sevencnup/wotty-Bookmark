import { describe, expect, it, vi } from 'vitest'
import { copyText } from './clipboard'

describe('copyText', () => {
  it('uses the modern Clipboard API when it succeeds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const fallback = vi.fn().mockReturnValue(true)

    await expect(copyText('server-code', { clipboard: { writeText }, fallback })).resolves.toBe(true)

    expect(writeText).toHaveBeenCalledWith('server-code')
    expect(fallback).not.toHaveBeenCalled()
  })

  it('falls back when the Clipboard API is unavailable or denied', async () => {
    const fallback = vi.fn().mockReturnValue(true)
    await expect(copyText('server-code', { fallback })).resolves.toBe(true)
    expect(fallback).toHaveBeenCalledWith('server-code')

    const denied = { writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')) }
    await expect(copyText('device-code', { clipboard: denied, fallback })).resolves.toBe(true)
    expect(fallback).toHaveBeenLastCalledWith('device-code')
  })

  it('reports failure rather than pretending a denied copy succeeded', async () => {
    await expect(copyText('device-code', { fallback: () => false })).resolves.toBe(false)
  })
})
