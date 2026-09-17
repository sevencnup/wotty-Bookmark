import { describe, expect, it } from 'vitest';
import { shouldApplyLocalization } from './sidebar-i18n';

describe('sidebar localization initialization', () => {
  it('skips the untouched default Chinese tree without inspecting WeakMap size', () => {
    expect(shouldApplyLocalization('zh-CN', false)).toBe(false);
  });

  it('applies localization for English and restores saved Chinese source text', () => {
    expect(shouldApplyLocalization('en', false)).toBe(true);
    expect(shouldApplyLocalization('zh-CN', true)).toBe(true);
  });
});
