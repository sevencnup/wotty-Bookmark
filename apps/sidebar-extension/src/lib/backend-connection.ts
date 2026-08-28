const PAIRING_PREFIX = 'bvpair.v1.';

interface PairingEnvelope {
  serverUrl?: string;
  secret?: string;
}

export interface PairingRequest {
  serverUrl: string;
  code: string;
}

export function normalizeServerUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('请输入 API 地址');

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('API 地址格式不正确');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('API 地址仅支持 HTTP 或 HTTPS');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('API 地址不能包含账号、查询参数或锚点');
  }
  return url.toString().replace(/\/+$/, '');
}

function parseLegacyPairingCode(value: string): PairingEnvelope {
  try {
    const encoded = value.slice(PAIRING_PREFIX.length);
    const padding = '='.repeat((4 - (encoded.length % 4)) % 4);
    const decoded = atob(encoded.replace(/-/g, '+').replace(/_/g, '/') + padding);
    return JSON.parse(decoded) as PairingEnvelope;
  } catch {
    throw new Error('设备码格式不正确');
  }
}

export function resolvePairingRequest(serverUrlValue: string, deviceCodeValue: string): PairingRequest {
  const deviceCode = deviceCodeValue.trim();
  if (!deviceCode) throw new Error('请输入设备码');

  if (deviceCode.startsWith(PAIRING_PREFIX)) {
    const envelope = parseLegacyPairingCode(deviceCode);
    if (!envelope.secret) throw new Error('设备码内容不完整');
    return {
      serverUrl: normalizeServerUrl(serverUrlValue || envelope.serverUrl || ''),
      code: deviceCode,
    };
  }

  if (!deviceCode.startsWith('bv_')) throw new Error('设备码格式不正确');
  return { serverUrl: normalizeServerUrl(serverUrlValue), code: deviceCode };
}
