import { describe, expect, it } from 'vitest';
import { normalizeServerUrl, resolvePairingRequest } from './backend-connection';

function legacyCode(serverUrl: string, secret = 'bv_legacy-secret'): string {
  const encoded = btoa(JSON.stringify({ serverUrl, secret }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `bvpair.v1.${encoded}`;
}

describe('backend connection helpers', () => {
  it('normalizes HTTP API addresses without changing their path', () => {
    expect(normalizeServerUrl(' https://example.com/api/ ')).toBe('https://example.com/api');
    expect(normalizeServerUrl('http://192.168.1.20:3000/')).toBe('http://192.168.1.20:3000');
  });

  it('rejects unsupported or ambiguous API addresses', () => {
    expect(() => normalizeServerUrl('ftp://example.com')).toThrow('仅支持 HTTP 或 HTTPS');
    expect(() => normalizeServerUrl('https://example.com?token=secret')).toThrow('不能包含账号、查询参数或锚点');
  });

  it('builds a request from a separate API address and device code', () => {
    expect(resolvePairingRequest('https://example.com/', ' bv_device-secret ')).toEqual({
      serverUrl: 'https://example.com',
      code: 'bv_device-secret',
    });
  });

  it('keeps legacy pairing codes and can recover their embedded address', () => {
    const code = legacyCode('https://legacy.example.com/');
    expect(resolvePairingRequest('', code)).toEqual({
      serverUrl: 'https://legacy.example.com',
      code,
    });
  });
});
