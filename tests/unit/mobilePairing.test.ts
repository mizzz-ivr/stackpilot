import { describe, expect, it } from 'vitest';
import {
  createMobilePairingUri,
  isMobilePairingExpired,
  isPrivateLanHostname,
  parseMobilePairingUri
} from '../../shared/domain/mobilePairing';

const connection = {
  baseUrl: 'http://192.168.1.20:41234',
  token: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
  expiresAt: 2_000_000_000_000
};

describe('mobilePairing domain', () => {
  it('ペアリングURIを生成して復元できる', () => {
    const uri = createMobilePairingUri(connection);
    expect(parseMobilePairingUri(uri)).toEqual(connection);
  });

  it('プライベートIPv4以外を拒否する', () => {
    expect(isPrivateLanHostname('10.0.0.5')).toBe(true);
    expect(isPrivateLanHostname('172.16.0.5')).toBe(true);
    expect(isPrivateLanHostname('172.31.255.254')).toBe(true);
    expect(isPrivateLanHostname('192.168.0.5')).toBe(true);
    expect(isPrivateLanHostname('172.32.0.1')).toBe(false);
    expect(isPrivateLanHostname('8.8.8.8')).toBe(false);
    expect(() => parseMobilePairingUri(createMobilePairingUri(connection).replace('192.168.1.20', '8.8.8.8'))).toThrow();
  });

  it('期限切れを判定する', () => {
    expect(isMobilePairingExpired(connection, connection.expiresAt - 1)).toBe(false);
    expect(isMobilePairingExpired(connection, connection.expiresAt)).toBe(true);
  });

  it('短いトークンと別スキームを拒否する', () => {
    expect(() =>
      createMobilePairingUri({ ...connection, token: 'short-token' })
    ).toThrow('ペアリングトークンが不正です。');
    expect(() => parseMobilePairingUri('https://example.com/pair')).toThrow('Stackpilot用のペアリングQRではありません。');
  });
});
