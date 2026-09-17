import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Folder, Search, X } from 'lucide-react';
export type FolderOption = {
  id: string;
  title: string;
  depth: number;
};

interface FolderPickerDropdownProps {
  value: string;
  onChange: (folderId: string) => void;
  options: FolderOption[];
  disabled?: boolean;
  compact?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}

export function FolderPickerDropdown({
  value,
  onChange,
  options,
  disabled = false,
  compact = false,
  placeholder = '根目录',
  ariaLabel = '选择文件夹',
}: FolderPickerDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedFolder = useMemo(() => {
    if (!value) return null;
    return options.find((opt) => opt.id === value) ?? null;
  }, [value, options]);

  const selectedTitle = selectedFolder ? selectedFolder.title : placeholder;

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => opt.title.toLowerCase().includes(q));
  }, [options, query]);

  // 点击外部自动收起
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  // 打开时自动聚焦搜索框并确保在弹窗/容器可视区域内
  useEffect(() => {
    if (open) {
      setQuery('');
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
        containerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    }
  }, [open]);

  const handleSelect = (folderId: string) => {
    onChange(folderId);
    setOpen(false);
  };

  return (
    <div
      className={`folder-picker ${compact ? 'is-compact' : ''} ${open ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''}`}
      ref={containerRef}
    >
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="folder-picker-trigger"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        type="button"
      >
        <Folder className="folder-trigger-icon" size={compact ? 13 : 14} />
        <span className="folder-trigger-text">{selectedTitle}</span>
        <ChevronDown className={`folder-trigger-arrow ${open ? 'rotated' : ''}`} size={compact ? 12 : 14} />
      </button>

      {open && (
        <div className="folder-picker-dropdown" role="listbox">
          <div className="folder-picker-search">
            <Search size={13} />
            <input
              aria-label="搜索文件夹"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索文件夹…"
              ref={searchInputRef}
              type="text"
              value={query}
            />
            {query && (
              <button
                className="folder-search-clear"
                onClick={() => setQuery('')}
                type="button"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="folder-picker-list">
            {/* 根目录选项 */}
            {(!query || '根目录'.includes(query.toLowerCase()) || 'root'.includes(query.toLowerCase())) && (
              <button
                className={`folder-picker-item ${value === '' ? 'is-selected' : ''}`}
                onClick={() => handleSelect('')}
                role="option"
                type="button"
              >
                <span className="folder-item-indent" style={{ width: 0 }} />
                <Folder className="folder-item-icon root-icon" size={13} />
                <span className="folder-item-name" data-i18n-force>{placeholder}</span>
                {value === '' && <Check className="folder-item-check" size={13} />}
              </button>
            )}

            {/* 各层级文件夹列表 */}
            {filteredOptions.map((folder) => {
              const isSelected = value === folder.id;
              return (
                <button
                  className={`folder-picker-item ${isSelected ? 'is-selected' : ''}`}
                  key={folder.id}
                  onClick={() => handleSelect(folder.id)}
                  role="option"
                  type="button"
                >
                  <span
                    className="folder-item-indent"
                    style={{ width: `${folder.depth * 14}px` }}
                  />
                  <Folder className="folder-item-icon" size={13} />
                  <span className="folder-item-name">{folder.title}</span>
                  {isSelected && <Check className="folder-item-check" size={13} />}
                </button>
              );
            })}

            {filteredOptions.length === 0 && !(!query || '根目录'.includes(query.toLowerCase())) && (
              <div className="folder-picker-empty">
                <span>无匹配文件夹</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
