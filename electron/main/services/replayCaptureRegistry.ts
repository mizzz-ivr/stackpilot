import { randomUUID } from 'node:crypto';

export interface ReplayCaptureKey {
  workspaceId: string;
  tabId: string;
  method: string;
  url: string;
}

export interface ReplayCaptureReservation {
  captureId: string;
  result: Promise<string | undefined>;
  cancel: () => void;
}

type PendingReplayCapture = {
  key: ReplayCaptureKey;
  claimed: boolean;
  resolve: (logId?: string) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export const defaultReplayCaptureClaimTimeoutMs = 3_000;
export const defaultReplayCaptureCompletionTimeoutMs = 30_000;

export class ReplayCaptureRegistry {
  private readonly pending = new Map<string, PendingReplayCapture>();

  reserve(
    key: ReplayCaptureKey,
    claimTimeoutMs = defaultReplayCaptureClaimTimeoutMs
  ): ReplayCaptureReservation {
    const captureId = randomUUID();
    let settled = false;
    let resolveResult: (logId?: string) => void = () => undefined;
    const result = new Promise<string | undefined>((resolve) => {
      resolveResult = resolve;
    });

    const settle = (logId?: string): void => {
      if (settled) return;
      settled = true;
      const current = this.pending.get(captureId);
      if (current) clearTimeout(current.timeout);
      this.pending.delete(captureId);
      resolveResult(logId);
    };

    const timeout = setTimeout(() => settle(undefined), Math.max(1, claimTimeoutMs));
    this.pending.set(captureId, {
      key: normalizeKey(key),
      claimed: false,
      resolve: settle,
      timeout
    });

    return {
      captureId,
      result,
      cancel: () => settle(undefined)
    };
  }

  claim(key: ReplayCaptureKey): string | undefined {
    const normalized = normalizeKey(key);
    for (const [captureId, capture] of this.pending) {
      if (capture.claimed || !sameKey(capture.key, normalized)) continue;
      capture.claimed = true;
      clearTimeout(capture.timeout);
      capture.timeout = setTimeout(
        () => capture.resolve(undefined),
        defaultReplayCaptureCompletionTimeoutMs
      );
      return captureId;
    }
    return undefined;
  }

  complete(captureId: string | undefined, logId: string): void {
    if (!captureId) return;
    const capture = this.pending.get(captureId);
    if (!capture || !capture.claimed) return;
    capture.resolve(logId);
  }

  cancel(captureId: string): void {
    this.pending.get(captureId)?.resolve(undefined);
  }
}

const normalizeKey = (key: ReplayCaptureKey): ReplayCaptureKey => ({
  ...key,
  method: key.method.trim().toUpperCase()
});

const sameKey = (left: ReplayCaptureKey, right: ReplayCaptureKey): boolean =>
  left.workspaceId === right.workspaceId &&
  left.tabId === right.tabId &&
  left.method === right.method &&
  left.url === right.url;
