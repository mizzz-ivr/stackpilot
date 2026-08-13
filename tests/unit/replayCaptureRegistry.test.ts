import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReplayCaptureRegistry } from '../../electron/main/services/replayCaptureRegistry';

const captureKey = {
  workspaceId: 'workspace-1',
  tabId: 'tab-1',
  method: 'GET',
  url: 'https://api.example.test/users?trace=edited'
};

afterEach(() => {
  vi.useRealTimers();
});

describe('ReplayCaptureRegistry', () => {
  it('完全一致する次の通信を一度だけclaimし、完了ログIDを返す', async () => {
    const registry = new ReplayCaptureRegistry();
    const reservation = registry.reserve(captureKey);

    expect(registry.claim({ ...captureKey, method: 'get' })).toBe(reservation.captureId);
    expect(registry.claim(captureKey)).toBeUndefined();

    registry.complete(reservation.captureId, 'replayed-log-1');
    await expect(reservation.result).resolves.toBe('replayed-log-1');
  });

  it('Workspace / tab / method / URLが異なる通信はclaimしない', () => {
    const registry = new ReplayCaptureRegistry();
    registry.reserve(captureKey);

    expect(registry.claim({ ...captureKey, workspaceId: 'workspace-2' })).toBeUndefined();
    expect(registry.claim({ ...captureKey, tabId: 'tab-2' })).toBeUndefined();
    expect(registry.claim({ ...captureKey, method: 'HEAD' })).toBeUndefined();
    expect(registry.claim({ ...captureKey, url: 'https://api.example.test/users?trace=other' })).toBeUndefined();
  });

  it('未claimの予約は期限切れでundefinedを返す', async () => {
    vi.useFakeTimers();
    const registry = new ReplayCaptureRegistry();
    const reservation = registry.reserve(captureKey, 25);

    await vi.advanceTimersByTimeAsync(25);

    await expect(reservation.result).resolves.toBeUndefined();
    expect(registry.claim(captureKey)).toBeUndefined();
  });

  it('claim後は送信開始待ち期限を過ぎても完了できる', async () => {
    vi.useFakeTimers();
    const registry = new ReplayCaptureRegistry();
    const reservation = registry.reserve(captureKey, 25);

    expect(registry.claim(captureKey)).toBe(reservation.captureId);
    await vi.advanceTimersByTimeAsync(30);
    registry.complete(reservation.captureId, 'slow-log');

    await expect(reservation.result).resolves.toBe('slow-log');
  });

  it('cancelした予約は以降claimされない', async () => {
    const registry = new ReplayCaptureRegistry();
    const reservation = registry.reserve(captureKey);

    reservation.cancel();

    await expect(reservation.result).resolves.toBeUndefined();
    expect(registry.claim(captureKey)).toBeUndefined();
  });
});