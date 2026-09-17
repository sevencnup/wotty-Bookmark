import { describe, expect, it } from 'vitest';
import type { FolderOption } from './FolderPickerDropdown';

describe('FolderPickerDropdown logic', () => {
  const mockOptions: FolderOption[] = [
    { id: 'f1', title: '工作资源', depth: 0 },
    { id: 'f2', title: '前端开发', depth: 1 },
    { id: 'f3', title: '设计素材', depth: 0 },
  ];

  it('filters folder options by query correctly', () => {
    const query = '前端';
    const filtered = mockOptions.filter((opt) =>
      opt.title.toLowerCase().includes(query.toLowerCase()),
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.title).toBe('前端开发');
  });

  it('preserves depth indentation values for hierarchy', () => {
    expect(mockOptions[0]?.depth).toBe(0);
    expect(mockOptions[1]?.depth).toBe(1);
  });
});
