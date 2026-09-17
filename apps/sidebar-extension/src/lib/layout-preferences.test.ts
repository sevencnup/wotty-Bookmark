import { describe, expect, it } from 'vitest';
import { isCompactToolbar } from './layout-preferences';

describe('compact toolbar preference', () => {
  it('uses an explicit boolean value so an unset or malformed preference stays expanded', () => {
    expect(isCompactToolbar(undefined)).toBe(false);
    expect(isCompactToolbar('true')).toBe(false);
    expect(isCompactToolbar(true)).toBe(true);
  });
});
