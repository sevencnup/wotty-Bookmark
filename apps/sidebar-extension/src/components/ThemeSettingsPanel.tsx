import { useEffect, useRef, useState } from 'react';
import { Check, ImageUp, Moon, Palette, Sun, X } from 'lucide-react';
import { optimizeSidebarThemeBackground } from '../lib/theme-preferences';
import type { SidebarTheme, SidebarThemePreferences } from '../lib/theme-preferences';

type ThemeOption = { id: SidebarTheme; label: string; description: string; preview: string; icon: typeof Sun };

const themes: ThemeOption[] = [
  { id: 'light', label: '白色', description: '简洁明亮', preview: 'light', icon: Sun },
  { id: 'dark', label: '黑色', description: '低光阅读', preview: 'dark', icon: Moon },
  { id: 'warm', label: '暖色', description: '柔和纸感', preview: 'warm', icon: Palette },
];

const customTheme: ThemeOption = { id: 'custom', label: '自定义', description: '自己的背景', preview: 'custom', icon: ImageUp };

export function ThemeSettingsPanel({ preferences, onChange, onClose }: {
  preferences: SidebarThemePreferences;
  onChange: (patch: Partial<SidebarThemePreferences>) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('.theme-settings-button')) return;
      if (event.target instanceof Node && !panelRef.current?.contains(event.target)) onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
    };
  }, [onClose]);

  const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setProcessing(true);
    setError(null);
    try {
      const backgroundImage = await optimizeSidebarThemeBackground(file);
      onChange({ theme: 'custom', backgroundImage });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '背景图片处理失败');
    } finally {
      setProcessing(false);
    }
  };

  return <section aria-label="主题设置" className="theme-settings-panel" ref={panelRef} role="dialog">
    <header className="theme-settings-header">
      <span className="theme-settings-mark"><Palette size={16} /></span>
      <div><strong>主题与背景</strong><small>只保存在当前设备</small></div>
      <button aria-label="关闭主题设置" className="theme-settings-close" onClick={onClose} type="button"><X size={16} /></button>
    </header>
    <div className="theme-settings-content">
      <div className="theme-options" role="radiogroup" aria-label="界面主题">
        {[...themes, customTheme].map(({ id, label, description, preview, icon: Icon }) => <button
          aria-checked={preferences.theme === id}
          className={`theme-option theme-option--${preview} ${preferences.theme === id ? 'is-active' : ''}`}
          key={id}
          onClick={() => {
            setError(null);
            if (id === 'custom' && !preferences.backgroundImage) inputRef.current?.click();
            else onChange({ theme: id });
          }}
          role="radio"
          type="button"
        >
          <span aria-hidden="true" className="theme-option-preview" style={id === 'custom' && preferences.backgroundImage ? { backgroundImage: `url("${preferences.backgroundImage}")` } : undefined}>
            <Icon size={14} />
            {preferences.theme === id && <i><Check size={11} /></i>}
          </span>
          <strong>{label}</strong>
          <small>{id === 'custom' && preferences.backgroundImage ? '已设置背景' : description}</small>
        </button>)}
      </div>
      <div className="theme-background-row">
        <div><strong>背景图片</strong><small>上传后自动压缩，最大 20 MB</small></div>
        <button className="theme-upload-button" disabled={processing} onClick={() => inputRef.current?.click()} type="button">
          <ImageUp size={14} />{processing ? '正在处理…' : preferences.backgroundImage ? '替换' : '上传'}
        </button>
        {preferences.backgroundImage && <button aria-label="移除背景图片" className="theme-remove-button" onClick={() => onChange({ theme: 'light', backgroundImage: null })} title="移除背景图片" type="button"><X size={15} /></button>}
        <input ref={inputRef} accept="image/*" hidden onChange={(event) => void handleImageChange(event)} type="file" />
      </div>
      {preferences.backgroundImage && <>
        <div className="theme-slider-row"><label htmlFor="theme-background-transparency">背景透明度</label><output>{preferences.customBackgroundTransparency}%</output><input id="theme-background-transparency" max="100" min="0" onChange={(event) => onChange({ theme: 'custom', customBackgroundTransparency: Number(event.currentTarget.value) })} type="range" value={preferences.customBackgroundTransparency} /></div>
        <div className="theme-color-row"><label htmlFor="theme-custom-text-color">文字颜色</label><input aria-label="自定义文字颜色" id="theme-custom-text-color" onChange={(event) => onChange({ theme: 'custom', customTextColor: event.currentTarget.value.toUpperCase() })} type="color" value={preferences.customTextColor} /><output>{preferences.customTextColor}</output></div>
      </>}
      {error && <p className="theme-settings-error" role="alert">{error}</p>}
    </div>
  </section>;
}
