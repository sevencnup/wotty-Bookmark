import { describe, expect, it } from 'vitest';
import { getSiteFaviconUrl, getSiteFaviconUrls } from './site-favicon';

describe('site favicon helpers', () => {
  it('provides browser and common site favicon candidates', () => {
    expect(getSiteFaviconUrls('https://example.com/docs/start?tab=1')).toEqual([
      'https://example.com/favicon.ico',
      'https://example.com/favicon.svg',
      'https://example.com/favicon.png',
      'https://example.com/favicon-32x32.png',
      'https://example.com/favicon-16x16.png',
      'https://example.com/apple-touch-icon.png',
      'https://example.com/apple-touch-icon-precomposed.png',
    ]);
    expect(getSiteFaviconUrl('https://example.com/docs')).toBe('https://example.com/favicon.ico');
  });

  it('ignores unsupported and invalid URLs', () => {
    expect(getSiteFaviconUrl('chrome://settings')).toBeNull();
    expect(getSiteFaviconUrl('not a url')).toBeNull();
    expect(getSiteFaviconUrl('')).toBeNull();
  });
});
