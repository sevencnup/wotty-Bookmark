import { browser } from 'wxt/browser';

export type SidebarTheme = 'light' | 'dark' | 'warm' | 'custom';

export type SidebarThemePreferences = {
  theme: SidebarTheme;
  backgroundImage: string | null;
  customTextColor: string;
  customBackgroundTransparency: number;
};

const THEME_PREFERENCES_KEY = 'bookmark-vault.sidebar-theme.v1';
const THEME_BACKGROUND_KEY = 'bookmark-vault.sidebar-theme-background.v1';
const MAX_BACKGROUND_DATA_URL_LENGTH = 1_450_000;
const MAX_BACKGROUND_UPLOAD_SIZE = 20 * 1024 * 1024;
const MAX_BACKGROUND_EDGE = 1_920;
const DEFAULT_CUSTOM_TEXT_COLOR = '#24272E';
const DEFAULT_BACKGROUND_TRANSPARENCY = 60;

export const DEFAULT_SIDEBAR_THEME_PREFERENCES: SidebarThemePreferences = {
  theme: 'light',
  backgroundImage: null,
  customTextColor: DEFAULT_CUSTOM_TEXT_COLOR,
  customBackgroundTransparency: DEFAULT_BACKGROUND_TRANSPARENCY,
};

function isTheme(value: unknown): value is SidebarTheme {
  return value === 'light' || value === 'dark' || value === 'warm' || value === 'custom';
}

function isBackgroundImage(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= MAX_BACKGROUND_DATA_URL_LENGTH
    && /^data:image\/[a-z0-9.+-]+;base64,/i.test(value);
}

function normalizePreferences(value: unknown): SidebarThemePreferences {
  if (!value || typeof value !== 'object') return DEFAULT_SIDEBAR_THEME_PREFERENCES;
  const stored = value as Partial<SidebarThemePreferences>;
  const backgroundImage = isBackgroundImage(stored.backgroundImage) ? stored.backgroundImage : null;
  const theme = isTheme(stored.theme) && (stored.theme !== 'custom' || backgroundImage) ? stored.theme : 'light';
  const customTextColor = typeof stored.customTextColor === 'string' && /^#[\da-f]{6}$/i.test(stored.customTextColor)
    ? stored.customTextColor.toUpperCase()
    : DEFAULT_CUSTOM_TEXT_COLOR;
  const customBackgroundTransparency = typeof stored.customBackgroundTransparency === 'number' && Number.isFinite(stored.customBackgroundTransparency)
    ? Math.min(100, Math.max(0, Math.round(stored.customBackgroundTransparency)))
    : DEFAULT_BACKGROUND_TRANSPARENCY;
  return { theme, backgroundImage, customTextColor, customBackgroundTransparency };
}

export async function loadSidebarThemePreferences(): Promise<SidebarThemePreferences> {
  const values = await browser.storage.local.get([THEME_PREFERENCES_KEY, THEME_BACKGROUND_KEY]);
  const stored = values[THEME_PREFERENCES_KEY];
  return normalizePreferences({
    ...(stored && typeof stored === 'object' ? stored : {}),
    backgroundImage: values[THEME_BACKGROUND_KEY],
  });
}

export async function saveSidebarThemePreferences(preferences: SidebarThemePreferences): Promise<void> {
  const { backgroundImage, ...settings } = normalizePreferences(preferences);
  await browser.storage.local.set({
    [THEME_PREFERENCES_KEY]: settings,
    [THEME_BACKGROUND_KEY]: backgroundImage,
  });
}

export function optimizeSidebarThemeBackground(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) return Promise.reject(new Error('请选择图片文件'));
  if (file.size > MAX_BACKGROUND_UPLOAD_SIZE) return Promise.reject(new Error('背景图片不能超过 20 MB'));

  return new Promise((resolve, reject) => {
    const image = document.createElement('img');
    const sourceUrl = URL.createObjectURL(file);
    const revokeSourceUrl = () => URL.revokeObjectURL(sourceUrl);
    image.onload = () => {
      revokeSourceUrl();
      const longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
      if (!longestEdge) {
        reject(new Error('图片尺寸无效'));
        return;
      }
      if (image.naturalWidth * image.naturalHeight > 80_000_000) {
        reject(new Error('图片尺寸过大，请使用分辨率较低的图片'));
        return;
      }
      let scale = Math.min(1, MAX_BACKGROUND_EDGE / longestEdge);
      let smallestResult = '';
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('浏览器不支持图片处理'));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        for (const quality of [0.9, 0.8, 0.7, 0.6, 0.5, 0.4]) {
          const dataUrl = canvas.toDataURL('image/webp', quality);
          if (!smallestResult || dataUrl.length < smallestResult.length) smallestResult = dataUrl;
          if (isBackgroundImage(dataUrl)) {
            resolve(dataUrl);
            return;
          }
        }
        scale *= 0.72;
      }
      if (isBackgroundImage(smallestResult)) {
        resolve(smallestResult);
        return;
      }
      reject(new Error('图片无法压缩到可保存的大小'));
    };
    image.onerror = () => {
      revokeSourceUrl();
      reject(new Error('图片读取失败'));
    };
    image.src = sourceUrl;
  });
}
