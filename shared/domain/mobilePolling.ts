export const mobilePollingDelaysMs = [2_000, 4_000, 8_000, 15_000] as const;

export type MobileAutoRefreshState = 'disabled' | 'active' | 'backoff' | 'paused' | 'stopped';

export const getMobilePollingDelay = (failureCount: number): number => {
  const normalized = Number.isFinite(failureCount) ? Math.max(0, Math.floor(failureCount)) : 0;
  const index = Math.min(normalized, mobilePollingDelaysMs.length - 1);
  return mobilePollingDelaysMs[index] ?? mobilePollingDelaysMs[0];
};

export const nextMobilePollingFailureCount = (failureCount: number): number =>
  Math.min(Math.max(0, Math.floor(failureCount)) + 1, mobilePollingDelaysMs.length - 1);
