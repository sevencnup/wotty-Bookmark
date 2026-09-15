import { describe, expect, it } from 'vitest'
import { getVariableVirtualWindow, getVirtualWindow } from './virtual-list'

describe('virtual list window', () => {
  it('renders only rows around the viewport while preserving total scroll height', () => {
    expect(getVirtualWindow(1000, 1200, 500, 80, 2)).toEqual({
      start: 13,
      end: 24,
      offset: 1040,
      totalSize: 80000,
    })
  })

  it('clamps empty and out-of-range values', () => {
    expect(getVirtualWindow(0, -20, 300, 60)).toEqual({ start: 0, end: 0, offset: 0, totalSize: 0 })
    expect(getVirtualWindow(3, 9999, 300, 60)).toEqual({ start: 3, end: 3, offset: 180, totalSize: 180 })
  })

  it('handles variable height items', () => {
    const heights = [42, 54, 54, 42, 54]
    const win = getVariableVirtualWindow(heights, 50, 100, 1)
    expect(win.start).toBeGreaterThanOrEqual(0)
    expect(win.end).toBeLessThanOrEqual(5)
    expect(win.totalSize).toBe(42 + 54 + 54 + 42 + 54)
  })
})
