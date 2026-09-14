import { createElement, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { SidebarLocale } from './lib/preferences';

const englishText: Record<string, string> = {
  '书签库': 'Bookmark library',
  '服务器已连接': 'Server connected',
  '连接服务器': 'Connect server',
  '只保存到服务器': 'Server-only storage',
  '不读取或写入浏览器原生书签': 'Never reads or writes browser-native bookmarks',
  '搜索服务器书签': 'Search server bookmarks',
  '搜索服务器书签或网址': 'Search server bookmarks or URLs',
  '收藏当前页 · SERVER': 'SAVE CURRENT PAGE · SERVER',
  '当前页面不可收藏': 'The current page cannot be saved',
  '请在普通网页中打开侧边栏': 'Open the sidebar on a normal web page',
  '保存到文件夹': 'Save to folder',
  '收藏到文件夹': 'Save to folder',
  '根目录': 'Root',
  '已收藏': 'Saved',
  '收藏': 'Save',
  '文件夹': 'Folder',
  '新增': 'New',
  '我的服务器书签': 'My server bookmarks',
  '侧边栏每 10 秒自动同步一次，重新聚焦时会立即同步': 'The sidebar refreshes every 10 seconds and immediately when focused',
  '个书签': 'bookmarks',
  '个文件夹': 'folders',
  '尚未同步': 'Not synced yet',
  '刚刚同步': 'Synced just now',
  '刷新': 'Refresh',
  '正在读取服务器书签库…': 'Loading server bookmarks…',
  '连接你的服务器书签库': 'Connect your server bookmark library',
  '连接后，这里只显示服务器中的书签，不会访问浏览器原生书签。': 'After connecting, this sidebar shows only server bookmarks and never accesses browser-native bookmarks.',
  '书签库暂时不可用': 'Bookmark library is temporarily unavailable',
  '重新连接': 'Reconnect',
  '书签库还是空的': 'Your bookmark library is empty',
  '在当前页点击“收藏”，或手动添加第一条服务器书签。': 'Save the current page or add your first server bookmark manually.',
  '新增书签': 'Add bookmark',
  '没有匹配的服务器书签': 'No matching server bookmarks',
  '换一个关键词试试。': 'Try another search term.',
  '服务器书签库已启用': 'Server bookmark library is enabled',
  '侧边栏收藏会直接保存到服务器；不会读取或写入浏览器原生书签。': 'Sidebar saves go directly to the server; browser-native bookmarks are never read or written.',
  '关闭': 'Close',
  '断开连接': 'Disconnect',
  '从管理后台生成一次性设备码。这里只建立服务器书签库连接，不需要 WebDAV 密码。': 'Create a one-time device code in the admin console. This connects only the server bookmark library and needs no WebDAV password.',
  'API 地址': 'API address',
  '一次性设备码': 'One-time device code',
  '取消': 'Cancel',
  '连接中…': 'Connecting…',
  '编辑服务器书签': 'Edit server bookmark',
  '新建文件夹': 'New folder',
  '新建服务器书签': 'New server bookmark',
  '名称': 'Name',
  '网址': 'URL',
  '保存到': 'Save to',
  '保存中…': 'Saving…',
  '保存到服务器': 'Save to server',
  '移动服务器书签': 'Move server bookmark',
  '目标文件夹': 'Destination folder',
  '移动中…': 'Moving…',
  '移动': 'Move',
  '删除书签？': 'Delete bookmark?',
  '删除文件夹？': 'Delete folder?',
  '将': 'Move',
  '移入服务器书签库回收站。': 'to the server bookmark library trash.',
  '文件夹中的内容也会一并移入。': 'Its contents move with the folder.',
  '删除中…': 'Deleting…',
  '移入回收站': 'Move to trash',
  '未命名': 'Untitled',
  '编辑': 'Edit',
  '回到顶部': 'Back to top',
  '无法读取服务器书签库': 'Could not load the server bookmark library',
  '操作失败，请重试': 'The action failed. Please try again.',
  '连接失败': 'Connection failed',
  '语言偏好读取失败': 'Could not load language preference',
  '服务器返回了不支持的界面语言': 'The server returned an unsupported interface language',
  '服务器是唯一数据源': 'The server is the only data source',
};

const englishPatterns: Array<[RegExp, string]> = [
  [/^(\d+) 个书签$/, '$1 bookmarks'],
  [/^(\d+) 个文件夹$/, '$1 folders'],
  [/^同步于 (.+)$/, 'Synced at $1'],
  [/^语言偏好读取失败（(\d+)）$/, 'Could not load language preference ($1)'],
];

function translate(value: string, locale: SidebarLocale): string {
  if (locale === 'zh-CN') return value;
  if (englishText[value]) return englishText[value];
  for (const [pattern, replacement] of englishPatterns) {
    if (pattern.test(value)) return value.replace(pattern, replacement);
  }
  return value;
}

const originalText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();
const attributes = ['aria-label', 'title', 'placeholder'];

function skipsText(element: Element | null): boolean {
  return Boolean(element?.closest('[data-i18n-skip], textarea, code, option:not([data-i18n-force]), .bookmark-title, .bookmark-url, .result-copy, .quick-save-copy strong, .connection-status-card span, .delete-content strong'));
}

function skipsAttribute(element: Element): boolean {
  // Inputs carry user data in their value, not in the localizable attributes
  // below. Keep placeholders and accessible names translatable.
  return Boolean(element.closest('[data-i18n-skip], code, .bookmark-title, .bookmark-url, .result-copy, .quick-save-copy strong, .connection-status-card span, .delete-content strong'));
}

function localizeText(node: Text, locale: SidebarLocale) {
  if (skipsText(node.parentElement)) return;
  const current = node.data;
  const saved = originalText.get(node);
  if (locale === 'zh-CN') {
    if (saved && current === translate(saved, 'en')) node.data = saved;
    return;
  }
  const source = saved && current === translate(saved, 'en') ? saved : current;
  originalText.set(node, source);
  const localized = translate(source, locale);
  if (localized !== current) node.data = localized;
}

function localizeAttribute(element: Element, attribute: string, locale: SidebarLocale) {
  if (skipsAttribute(element)) return;
  const current = element.getAttribute(attribute);
  if (current === null) return;
  const values = originalAttributes.get(element) ?? new Map<string, string>();
  const saved = values.get(attribute);
  if (locale === 'zh-CN') {
    if (saved && current === translate(saved, 'en')) element.setAttribute(attribute, saved);
    return;
  }
  const source = saved && current === translate(saved, 'en') ? saved : current;
  values.set(attribute, source);
  originalAttributes.set(element, values);
  const localized = translate(source, locale);
  if (localized !== current) element.setAttribute(attribute, localized);
}

function applyLocalization(root: HTMLElement, locale: SidebarLocale) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    localizeText(node as Text, locale);
    node = walker.nextNode();
  }
  root.querySelectorAll('*').forEach((element) => attributes.forEach((attribute) => localizeAttribute(element, attribute, locale)));
}

export function SidebarUiLocalization({ children, locale }: { children: ReactNode; locale: SidebarLocale }) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const apply = () => applyLocalization(element, locale);
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(element, { attributes: true, attributeFilter: attributes, characterData: true, childList: true, subtree: true });
    return () => observer.disconnect();
  }, [locale]);
  return createElement('div', { 'data-i18n-root': '', ref: root, style: { display: 'contents' } }, children);
}
