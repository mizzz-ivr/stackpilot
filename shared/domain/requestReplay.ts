import type { SafeRequestBodyPreview } from './requestBody';

export const requestReplayMethods = ['GET', 'HEAD'] as const;
export type RequestReplayMethod = (typeof requestReplayMethods)[number];

export const requestReplayQueryLimits = {
  maxEntries: 50,
  maxNameLength: 128,
  maxValueLength: 2048,
  maxSerializedLength: 8192
} as const;

export interface RequestReplayQueryEntry {
  name: string;
  value: string;
}

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
  queryEntries?: RequestReplayQueryEntry[];
}

export type RequestReplayQueryValidation =
  | { valid: true }
  | { valid: false; errorMessage: string };

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
        | 'invalid-query'
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

export const parseRequestReplayQueryEntries = (sourceUrl: string): RequestReplayQueryEntry[] => {
  const url = new URL(sourceUrl);
  return Array.from(url.searchParams.entries(), ([name, value]) => ({ name, value }));
};

export const validateRequestReplayQueryEntries = (
  entries: RequestReplayQueryEntry[]
): RequestReplayQueryValidation => {
  if (entries.length > requestReplayQueryLimits.maxEntries) {
    return {
      valid: false,
      errorMessage: `Query parameterは最大${requestReplayQueryLimits.maxEntries}件まで指定できます。`
    };
  }

  for (const entry of entries) {
    if (entry.name.length === 0) {
      return {
        valid: false,
        errorMessage: 'Query名は空にできません。'
      };
    }
    if (entry.name.length > requestReplayQueryLimits.maxNameLength) {
      return {
        valid: false,
        errorMessage: `Query名は${requestReplayQueryLimits.maxNameLength}文字以内で指定してください。`
      };
    }
    if (entry.value.length > requestReplayQueryLimits.maxValueLength) {
      return {
        valid: false,
        errorMessage: `Query値は${requestReplayQueryLimits.maxValueLength}文字以内で指定してください。`
      };
    }
    if (containsControlCharacter(entry.name) || containsControlCharacter(entry.value)) {
      return {
        valid: false,
        errorMessage: 'Query名・値に制御文字は使用できません。'
      };
    }
  }

  const serialized = toSearchParams(entries).toString();
  if (serialized.length > requestReplayQueryLimits.maxSerializedLength) {
    return {
      valid: false,
      errorMessage: `URLエンコード後のqueryは${requestReplayQueryLimits.maxSerializedLength}文字以内で指定してください。`
    };
  }

  return { valid: true };
};

export const createRequestReplayTargetUrl = (
  sourceUrl: string,
  queryEntries?: RequestReplayQueryEntry[]
): string => {
  const url = new URL(sourceUrl);
  url.hash = '';
  if (queryEntries) {
    url.search = toSearchParams(queryEntries).toString();
  }
  return url.toString();
};

export const isRequestReplayRequest = (value: unknown): value is RequestReplayRequest => {
  if (!isRecord(value)) return false;
  if (
    typeof value.workspaceId !== 'string' ||
    value.workspaceId.length === 0 ||
    typeof value.logId !== 'string' ||
    value.logId.length === 0
  ) {
    return false;
  }

  if (typeof value.queryEntries === 'undefined') return true;
  return Array.isArray(value.queryEntries) && value.queryEntries.every(isRequestReplayQueryEntry);
};

const toSearchParams = (entries: RequestReplayQueryEntry[]): URLSearchParams => {
  const params = new URLSearchParams();
  for (const entry of entries) {
    params.append(entry.name, entry.value);
  }
  return params;
};

const isRequestReplayQueryEntry = (value: unknown): value is RequestReplayQueryEntry =>
  isRecord(value) && typeof value.name === 'string' && typeof value.value === 'string';

const containsControlCharacter = (value: string): boolean => /[\u0000-\u001f\u007f]/u.test(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
