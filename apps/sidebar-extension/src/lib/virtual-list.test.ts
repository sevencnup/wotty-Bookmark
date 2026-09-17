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
      // 5 folders (32px) and 5 bookmarks (32px)
      // heights = [32, 32, 32, 32, 32, 32, 32, 32, 32, 32]
      // total = 10*32 = 320
      const heights = [32, 32, 32, 32, 32, 32, 32, 32, 32, 32];
      const win = getVariableVirtualWindow(heights, 0, 100, 1);
      expect(win.start).toBe(0);
      expect(win.totalSize).toBe(320);
      expect(win.offset).toBe(0);
    });

    it('calculates accurate slice and offset when scrolled in mixed list', () => {
      // item 0: 32 (0-32)
      // item 1: 32 (32-64)
      // item 2: 32 (64-96)
      // item 3: 32 (96-128)
      // item 4: 32 (128-160)
      const heights = [32, 32, 32, 32, 32];
      // scroll to 70px (item 2 is visible), viewport 50px, overscan 1
      const win = getVariableVirtualWindow(heights, 70, 50, 1);
      expect(win.start).toBe(1); // item 2 - 1 = 1
      expect(win.offset).toBe(32); // position before item 1
      expect(win.totalSize).toBe(160);
    });
  });
});
