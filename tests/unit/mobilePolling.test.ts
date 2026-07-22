import { describe, expect, it } from 'vitest';
import {
  getMobilePollingDelay,
  mobilePollingDelaysMs,
  nextMobilePollingFailureCount
} from '../../shared/domain/mobilePolling';

describe('mobile polling rules', () => {
  it('失敗回数に応じて2秒から15秒まで段階的に伸ばす', () => {
    expect(mobilePollingDelaysMs).toEqual([2_000, 4_000, 8_000, 15_000]);
    expect(getMobilePollingDelay(0)).toBe(2_000);
    expect(getMobilePollingDelay(1)).toBe(4_000);
    expect(getMobilePollingDelay(2)).toBe(8_000);
    expect(getMobilePollingDelay(3)).toBe(15_000);
    expect(getMobilePollingDelay(10)).toBe(15_000);
  });

  it('失敗回数を上限付きで進める', () => {
    expect(nextMobilePollingFailureCount(0)).toBe(1);
    expect(nextMobilePollingFailureCount(1)).toBe(2);
    expect(nextMobilePollingFailureCount(2)).toBe(3);
    expect(nextMobilePollingFailureCount(3)).toBe(3);
  });

  it('不正な失敗回数を安全な初期値へ補正する', () => {
    expect(getMobilePollingDelay(-1)).toBe(2_000);
    expect(getMobilePollingDelay(Number.NaN)).toBe(2_000);
  });
});
