export type VirtualWindow = {
  start: number;
  end: number;
  offset: number;
  totalSize: number;
};

/** Calculate the slice of rows needed for fixed-height items in the viewport. */
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

/** Calculate the slice of rows needed for variable-height items in the viewport. */
export function getVariableVirtualWindow(
  itemHeights: number[],
  scrollTop: number,
  viewportHeight: number,
  overscan = 6,
): VirtualWindow {
  const total = itemHeights.length;
  if (total === 0) {
    return { start: 0, end: 0, offset: 0, totalSize: 0 };
  }

  const positions: number[] = [0];
  for (let i = 0; i < total; i++) {
    const previousPosition = positions[i] ?? 0;
    const itemHeight = itemHeights[i] ?? 1;
    positions[i + 1] = previousPosition + Math.max(1, itemHeight);
  }
  const totalSize = positions[total] ?? 0;

  if (Math.max(0, scrollTop) >= totalSize) {
    return { start: total, end: total, offset: totalSize, totalSize };
  }

  const safeScrollTop = Math.max(0, scrollTop);
  const safeOverscan = Math.max(0, Math.floor(overscan));

  // Binary search for the first visible item
  let low = 0;
  let high = total - 1;
  let firstVisible = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if ((positions[mid + 1] ?? totalSize) > safeScrollTop) {
      firstVisible = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  // Binary search for the last visible item
  const viewportBottom = safeScrollTop + Math.max(1, viewportHeight);
  low = firstVisible;
  high = total - 1;
  let lastVisible = firstVisible;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if ((positions[mid] ?? totalSize) < viewportBottom) {
      lastVisible = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const start = Math.max(0, firstVisible - safeOverscan);
  const end = Math.min(total, lastVisible + 1 + safeOverscan);
  const offset = positions[start] ?? totalSize;

  return {
    start,
    end: Math.max(start, end),
    offset,
    totalSize,
  };
}
