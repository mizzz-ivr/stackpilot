export const mobilePairingScheme = 'stackpilot:';
export const mobilePairingHost = 'pair';
export const mobilePairingTokenMinLength = 32;

export interface MobilePairingConnection {
  baseUrl: string;
  token: string;
  expiresAt: number;
}

export type MobilePairingServerState = 'stopped' | 'starting' | 'running' | 'error';

export interface MobilePairingServerStatus {
  state: MobilePairingServerState;
  baseUrl?: string;
  pairingUri?: string;
  expiresAt?: number;
  lastAccessAt?: number;
  errorMessage?: string;
}

export const createMobilePairingUri = (connection: MobilePairingConnection): string => {
  const normalized = normalizeMobilePairingConnection(connection);
  const url = new URL(`${mobilePairingScheme}//${mobilePairingHost}`);
  url.searchParams.set('baseUrl', normalized.baseUrl);
  url.searchParams.set('token', normalized.token);
  url.searchParams.set('expiresAt', String(normalized.expiresAt));
  return url.toString();
};

export const parseMobilePairingUri = (value: string): MobilePairingConnection => {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('QRコードの形式が正しくありません。');
  }

  if (url.protocol !== mobilePairingScheme || url.hostname !== mobilePairingHost) {
    throw new Error('Stackpilot用のペアリングQRではありません。');
  }

  const baseUrl = url.searchParams.get('baseUrl') ?? '';
  const token = url.searchParams.get('token') ?? '';
  const expiresAt = Number(url.searchParams.get('expiresAt'));

  return normalizeMobilePairingConnection({ baseUrl, token, expiresAt });
};

export const normalizeMobilePairingConnection = (
  connection: MobilePairingConnection
): MobilePairingConnection => {
  let endpoint: URL;
  try {
    endpoint = new URL(connection.baseUrl.trim());
  } catch {
    throw new Error('接続先URLが正しくありません。');
  }

  if (endpoint.protocol !== 'http:') {
    throw new Error('ローカル接続はHTTPのみ利用できます。');
  }

  if (endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) {
    throw new Error('接続先URLに不要な情報が含まれています。');
  }

  if (!isPrivateLanHostname(endpoint.hostname)) {
    throw new Error('同一LAN内のプライベートIPv4アドレスのみ接続できます。');
  }

  if (connection.token.trim().length < mobilePairingTokenMinLength) {
    throw new Error('ペアリングトークンが不正です。');
  }

  if (!Number.isFinite(connection.expiresAt) || connection.expiresAt <= 0) {
    throw new Error('ペアリング有効期限が不正です。');
  }

  return {
    baseUrl: endpoint.origin,
    token: connection.token.trim(),
    expiresAt: connection.expiresAt
  };
};

export const isMobilePairingExpired = (
  connection: Pick<MobilePairingConnection, 'expiresAt'>,
  now = Date.now()
): boolean => connection.expiresAt <= now;

export const isPrivateLanHostname = (hostname: string): boolean => {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second] = parts;
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
};
