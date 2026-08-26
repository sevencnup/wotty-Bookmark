import { describe, expect, it } from 'vitest';
import { getSiteFaviconUrl } from './site-favicon';

describe('site favicon helpers', () => {
  it('uses the site origin for HTTP and HTTPS bookmarks', () => {
    expect(getSiteFaviconUrl('https://example.com/docs/start?tab=1')).toBe('https://example.com/favicon.ico');
    expect(getSiteFaviconUrl('http://example.com:8080/docs')).toBe('http://example.com:8080/favicon.ico');
  });

  it('ignores unsupported and invalid URLs', () => {
    expect(getSiteFaviconUrl('chrome://settings')).toBeNull();
    expect(getSiteFaviconUrl('not a url')).toBeNull();
    expect(getSiteFaviconUrl('')).toBeNull();
  });
});
