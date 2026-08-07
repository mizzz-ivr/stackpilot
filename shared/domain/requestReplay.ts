import type { SafeRequestBodyPreview } from './requestBody';

export const requestReplayMethods = ['GET', 'HEAD'] as const;
export type RequestReplayMethod = (typeof requestReplayMethods)[number];

export type RequestReplayBlockReason =
  | 'unsupported-method'
  | 'request-body-present'
  | 'invalid-url'
  | 'unsupported-url-scheme'
  | 'url-credentials-present';

export interface RequestReplayCandidate {
  method: string;
  url: string;
  requestBody?: Pick<SafeRequestBodyPreview, 'byteLength'>;
}

export interface RequestReplayEligibility {
  replayable: boolean;
  method: string;
  reasonCode?: RequestReplayBlockReason;
  reasonMessage?: string;
}

export interface RequestReplayRequest {
  workspaceId: string;
  logId: string;
}

export type RequestReplayResult =
  | {
      status: 'replayed';
      responseStatus: number;
      durationMs: number;
    }
  | {
      status: 'cancelled';
    }
  | {
      status: 'failed';
      errorCode:
        | 'invalid-request'
        | 'workspace-not-found'
        | 'log-not-found'
        | 'workspace-mismatch'
        | 'not-replayable'
        | 'workspace-not-active'
        | 'replay-in-progress'
        | 'dialog-unavailable'
        | 'execution-failed';
      errorMessage: string;
    };

export const evaluateRequestReplayEligibility = (
  candidate: RequestReplayCandidate
): RequestReplayEligibility => {
  const method = candidate.method.trim().toUpperCase();
  if (!requestReplayMethods.includes(method as RequestReplayMethod)) {
    return {
      replayable: false,
      method,
      reasonCode: 'unsupported-method',
      reasonMessage: '安全な再実行MVPではGET / HEADだけを再実行できます。'
    };
  }

  if ((candidate.requestBody?.byteLength ?? 0) > 0) {
    return {
      replayable: false,
      method,
      reasonCode: 'request-body-present',
      reasonMessage: 'Request bodyを持つ通信は内容を変えずに再現できないため、再実行できません。'
    };
  }

  let url: URL;
  try {
    url = new URL(candidate.url);
  } catch {
    return {
      replayable: false,
      method,
      reasonCode: 'invalid-url',
      reasonMessage: '再実行対象のURLを解釈できません。'
    };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      replayable: false,
      method,
      reasonCode: 'unsupported-url-scheme',
      reasonMessage: 'HTTP / HTTPS通信だけを再実行できます。'
    };
  }

  if (url.username || url.password) {
    return {
      replayable: false,
      method,
      reasonCode: 'url-credentials-present',
      reasonMessage: 'URLに認証情報が含まれる通信は安全のため再実行できません。'
    };
  }

  return { replayable: true, method };
};

export const isRequestReplayRequest = (value: unknown): value is RequestReplayRequest => {
  if (!isRecord(value)) return false;
  return (
    typeof value.workspaceId === 'string' &&
    value.workspaceId.length > 0 &&
    typeof value.logId === 'string' &&
    value.logId.length > 0
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
