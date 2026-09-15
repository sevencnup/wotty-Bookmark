export type VirtualWindow = {
  start: number;
  end: number;
  offset: number;
  totalSize: number;
};

/** Calculate the slice of rows needed for the current viewport in the sidebar. */
export function getVirtualWindow(
  total: number,
  scrollTop: number,
  viewportHeight: number,
  itemHeight: number,
  overscan = 6,
): VirtualWindow {
  const safeTotal = Math.max(0, total);
  const safeHeight = Math.max(1, itemHeight);
  const safeOverscan = Math.max(0, Math.floor(overscan));
  if (safeTotal > 0 && Math.max(0, scrollTop) >= safeTotal * safeHeight) {
    return { start: safeTotal, end: safeTotal, offset: safeTotal * safeHeight, totalSize: safeTotal * safeHeight };
  }
  const firstVisible = Math.max(0, Math.floor(Math.max(0, scrollTop) / safeHeight));
  const visibleCount = Math.ceil(Math.max(0, viewportHeight) / safeHeight);
  const start = Math.max(0, firstVisible - safeOverscan);
  const end = Math.min(safeTotal, firstVisible + visibleCount + safeOverscan);
  return {
    start,
    end: Math.max(start, end),
    offset: start * safeHeight,
    totalSize: safeTotal * safeHeight,
  };
}
