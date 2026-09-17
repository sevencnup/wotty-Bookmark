import { describe, expect, it } from 'vitest';
import { getVariableVirtualWindow, getVirtualWindow } from './virtual-list';

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

  describe('getVariableVirtualWindow', () => {
    it('returns empty window for empty heights array', () => {
      expect(getVariableVirtualWindow([], 0, 400)).toEqual({
        start: 0,
        end: 0,
        offset: 0,
        totalSize: 0,
      });
    });

    it('handles mixed heights correctly', () => {
      // 5 folders (36px) and 5 bookmarks (36px)
      // heights = [36, 36, 36, 36, 36, 36, 36, 36, 36, 36]
      // total = 10*36 = 360
      const heights = [36, 36, 36, 36, 36, 36, 36, 36, 36, 36];
      const win = getVariableVirtualWindow(heights, 0, 100, 1);
      expect(win.start).toBe(0);
      expect(win.totalSize).toBe(360);
      expect(win.offset).toBe(0);
    });

    it('calculates accurate slice and offset when scrolled in mixed list', () => {
      // item 0: 36 (0-36)
      // item 1: 36 (36-72)
      // item 2: 36 (72-108)
      // item 3: 36 (108-144)
      // item 4: 36 (144-180)
      const heights = [36, 36, 36, 36, 36];
      // scroll to 80px (item 2 is visible), viewport 50px, overscan 1
      const win = getVariableVirtualWindow(heights, 80, 50, 1);
      expect(win.start).toBe(1); // item 2 - 1 = 1
      expect(win.offset).toBe(36); // position before item 1
      expect(win.totalSize).toBe(180);
    });
  });
});
