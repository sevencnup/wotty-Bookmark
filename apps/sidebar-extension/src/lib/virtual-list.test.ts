import { describe, expect, it } from 'vitest';
import { getVirtualWindow } from './virtual-list';

describe('sidebar virtual list window calculator', () => {
  it('returns empty window when total is 0', () => {
    expect(getVirtualWindow(0, 0, 400, 38)).toEqual({
      start: 0,
      end: 0,
      offset: 0,
      totalSize: 0,
    });
  });

  it('calculates visible slice with overscan', () => {
    // 1000 items, 38px each, scrolled to 380px (10th item), viewport 380px (10 items)
    const win = getVirtualWindow(1000, 380, 380, 38, 4);
    // first visible = 10, visible count = 10, overscan = 4 => start = 6, end = 24
    expect(win.start).toBe(6);
    expect(win.end).toBe(24);
    expect(win.offset).toBe(6 * 38);
    expect(win.totalSize).toBe(1000 * 38);
  });

  it('clamps to total items when near the end', () => {
    const win = getVirtualWindow(20, 700, 400, 38, 5);
    expect(win.end).toBe(20);
    expect(win.totalSize).toBe(20 * 38);
  });
});
