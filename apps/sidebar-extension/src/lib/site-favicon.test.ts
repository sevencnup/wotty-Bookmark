import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

  it('constrains raster favicon rendering to the bookmark icon slot', () => {
    const app = readFileSync(resolve(import.meta.dirname, '..', 'App.tsx'), 'utf8');
    const styles = readFileSync(resolve(import.meta.dirname, '..', 'styles.css'), 'utf8');

    expect(app).toContain('height={16}');
    expect(app).toContain('width={16}');
    expect(styles).toMatch(/\.site-favicon\s*\{[\s\S]*width:\s*16px;[\s\S]*height:\s*16px;/);
  });
});
