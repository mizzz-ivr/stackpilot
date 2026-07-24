import type { ApiLogEntry, Workspace } from '../contracts';
import type { InspectorFilter } from './inspector';
import { isSensitiveRequestBodyFieldName, type SafeRequestBodyPreview } from './requestBody';
import type { SafeResponseBodyPreview } from './responseBody';

export const apiLogExportFormats = ['json', 'har'] as const;
export type ApiLogExportFormat = (typeof apiLogExportFormats)[number];
export type ApiLogExportFilterKind = InspectorFilter['kind'];

export const maxApiLogExportEntries = 500;

export interface ApiLogExportRequest {
  workspaceId: string;
  format: ApiLogExportFormat;
  filterKind: ApiLogExportFilterKind;
}

export type ApiLogExportResult =
  | {
      status: 'saved';
      filePath: string;
      exportedCount: number;
      omittedCount: number;
    }
  | {
      status: 'cancelled';
      exportedCount: 0;
      omittedCount: 0;
    }
  | {
      status: 'failed';
      exportedCount: 0;
      omittedCount: 0;
      errorMessage: string;
    };

export interface SafeApiLogExportArtifact {
  content: string;
  extension: ApiLogExportFormat;
  exportedCount: number;
  omittedCount: number;
}

export interface CreateSafeApiLogExportInput {
  workspace: Pick<Workspace, 'id' | 'name' | 'environmentType' | 'customEnvironmentLabel'>;
  logs: ApiLogEntry[];
  format: ApiLogExportFormat;
  filterKind: ApiLogExportFilterKind;
  exportedAt?: number;
  maxEntries?: number;
}

interface SafeExportLog {
  id: string;
  resourceType: ApiLogEntry['type'];
  method: string;
  url: string;
  status?: number;
  durationMs?: number;
  requestHeaders: Record<string, string>;
  requestBody?: SafeRequestBodyPreview;
  responseHeaders: Record<string, string>;
  responseBody?: SafeResponseBodyPreview;
  networkError?: 'request-failed';
  startedAt: number;
  finishedAt?: number;
  updatedAt?: number;
}

const sensitiveHeaderNames = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'api-key',
  'x-auth-token',
  'x-csrf-token',
  'x-xsrf-token',
  'x-amz-security-token',
  'x-goog-api-key'
]);

const urlHeaderNames = new Set(['location', 'content-location', 'referer', 'referrer']);
const sensitiveQueryNames = new Set(['signature', 'sig', 'credential', 'jwt', 'authcode', 'authorizationcode']);

export const isApiLogExportRequest = (value: unknown): value is ApiLogExportRequest => {
  if (!isRecord(value)) return false;
  return (
    typeof value.workspaceId === 'string' &&
    value.workspaceId.length > 0 &&
    typeof value.format === 'string' &&
    apiLogExportFormats.includes(value.format as ApiLogExportFormat) &&
    (value.filterKind === 'all' || value.filterKind === 'xhr' || value.filterKind === 'fetch')
  );
};

export const createSafeApiLogExport = (input: CreateSafeApiLogExportInput): SafeApiLogExportArtifact => {
  const limit = Math.min(
    maxApiLogExportEntries,
    Math.max(1, Math.floor(input.maxEntries ?? maxApiLogExportEntries))
  );
  const matchingLogs = input.logs.filter(
    (log) => log.workspaceId === input.workspace.id && matchesFilter(log, input.filterKind)
  );
  const selectedLogs = matchingLogs.slice(0, limit);
  const safeLogs = selectedLogs.map(toSafeExportLog);
  const exportedAt = new Date(input.exportedAt ?? Date.now()).toISOString();
  const omittedCount = Math.max(0, matchingLogs.length - selectedLogs.length);

  return {
    content:
      input.format === 'har'
        ? createHarContent(input.workspace, safeLogs, input.filterKind, exportedAt, omittedCount)
        : createJsonContent(input.workspace, safeLogs, input.filterKind, exportedAt, omittedCount),
    extension: input.format,
    exportedCount: safeLogs.length,
    omittedCount
  };
};

export const sanitizeExportUrl = (value: string): string => {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';

    const queryNames = [...new Set([...url.searchParams.keys()])];
    queryNames.forEach((name) => {
      if (isSensitiveExportFieldName(name)) {
        url.searchParams.set(name, '<redacted>');
      }
    });

    if (url.hash) {
      url.hash = '#redacted';
    }

    return url.toString();
  } catch {
    return '<redacted-invalid-url>';
  }
};

export const sanitizeExportHeaders = (headers: Record<string, string>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(headers)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) => {
        const normalizedName = name.trim().toLowerCase();
        if (isSensitiveExportHeaderName(normalizedName)) {
          return [name, '<redacted>'];
        }
        if (urlHeaderNames.has(normalizedName)) {
          return [name, sanitizeExportUrl(value)];
        }
        if (normalizedName === 'refresh') {
          return [name, '<redacted>'];
        }
        return [name, value];
      })
  );

export const isSensitiveExportHeaderName = (name: string): boolean => {
  const normalized = name.trim().toLowerCase();
  const compact = normalized.replace(/[^a-z0-9]/g, '');
  return (
    isSensitiveRequestBodyFieldName(name) ||
    sensitiveHeaderNames.has(normalized) ||
    compact.endsWith('token') ||
    compact.endsWith('apikey') ||
    compact.endsWith('authorization') ||
    compact.endsWith('cookie')
  );
};

const isSensitiveExportFieldName = (name: string): boolean => {
  const compact = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return isSensitiveRequestBodyFieldName(name) || sensitiveQueryNames.has(compact);
};

const matchesFilter = (log: ApiLogEntry, filterKind: ApiLogExportFilterKind): boolean =>
  filterKind === 'all' || log.type === filterKind;

const toSafeExportLog = (log: ApiLogEntry): SafeExportLog => ({
  id: log.id,
  resourceType: log.type,
  method: log.method.toUpperCase(),
  url: sanitizeExportUrl(log.url),
  status: log.status,
  durationMs: log.durationMs,
  requestHeaders: sanitizeExportHeaders(log.requestHeaders),
  requestBody: cloneRequestBody(log.requestBody),
  responseHeaders: sanitizeExportHeaders(log.responseHeaders),
  responseBody: cloneResponseBody(log.responseBody),
  networkError: log.status === undefined ? 'request-failed' : undefined,
  startedAt: log.startedAt,
  finishedAt: log.finishedAt,
  updatedAt: log.updatedAt
});

const cloneRequestBody = (body?: SafeRequestBodyPreview): SafeRequestBodyPreview | undefined => {
  if (!body) return undefined;
  return {
    kind: body.kind,
    contentType: body.contentType,
    content: body.kind === 'unavailable' ? undefined : body.content,
    byteLength: body.byteLength,
    isTruncated: body.isTruncated,
    redactedFieldPaths: [...body.redactedFieldPaths],
    unavailableReason: body.unavailableReason
  };
};

const cloneResponseBody = (body?: SafeResponseBodyPreview): SafeResponseBodyPreview | undefined => {
  if (!body) return undefined;
  return {
    kind: body.kind,
    contentType: body.contentType,
    content: body.kind === 'unavailable' ? undefined : body.content,
    byteLength: body.byteLength,
    isTruncated: body.isTruncated,
    redactedFieldPaths: [...body.redactedFieldPaths],
    unavailableReason: body.unavailableReason
  };
};

const createJsonContent = (
  workspace: CreateSafeApiLogExportInput['workspace'],
  logs: SafeExportLog[],
  filterKind: ApiLogExportFilterKind,
  exportedAt: string,
  omittedCount: number
): string =>
  `${JSON.stringify(
    {
      schema: 'stackpilot-safe-log-export',
      version: 1,
      exportedAt,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        environmentType: workspace.environmentType,
        customEnvironmentLabel: workspace.customEnvironmentLabel
      },
      filter: filterKind,
      counts: {
        exported: logs.length,
        omitted: omittedCount
      },
      security: {
        sanitized: true,
        rawBodiesIncluded: false,
        cookiesExpanded: false,
        urlUserInfoRemoved: true,
        urlFragmentsRedacted: true,
        sensitiveQueryValuesRedacted: true,
        sensitiveHeaderValuesRedacted: true
      },
      logs
    },
    null,
    2
  )}\n`;

const createHarContent = (
  workspace: CreateSafeApiLogExportInput['workspace'],
  logs: SafeExportLog[],
  filterKind: ApiLogExportFilterKind,
  exportedAt: string,
  omittedCount: number
): string => {
  const entries = [...logs]
    .sort((left, right) => left.startedAt - right.startedAt)
    .map((log) => toHarEntry(log));

  return `${JSON.stringify(
    {
      log: {
        version: '1.2',
        creator: {
          name: 'Stackpilot',
          version: '0.1.0'
        },
        comment: '安全化済みログです。raw body、Cookie値、認証情報は含みません。',
        entries,
        _stackpilot: {
          schemaVersion: 1,
          exportedAt,
          workspace: {
            id: workspace.id,
            name: workspace.name,
            environmentType: workspace.environmentType,
            customEnvironmentLabel: workspace.customEnvironmentLabel
          },
          filter: filterKind,
          exportedCount: logs.length,
          omittedCount,
          sanitized: true
        }
      }
    },
    null,
    2
  )}\n`;
};

const toHarEntry = (log: SafeExportLog) => {
  const requestBody = canExportRequestBody(log.requestBody) ? log.requestBody : undefined;
  const responseBody = log.responseBody?.kind === 'json' && log.responseBody.content
    ? log.responseBody
    : undefined;
  const durationMs = Math.max(0, log.durationMs ?? 0);
  const redirectUrl = getHeaderValue(log.responseHeaders, 'location') ?? '';

  return {
    startedDateTime: new Date(log.startedAt).toISOString(),
    time: durationMs,
    request: {
      method: log.method,
      url: log.url,
      httpVersion: '',
      cookies: [],
      headers: toHarHeaders(log.requestHeaders),
      queryString: toHarQueryString(log.url),
      postData: requestBody
        ? {
            mimeType: requestBody.contentType ?? 'application/octet-stream',
            text: requestBody.content
          }
        : undefined,
      headersSize: -1,
      bodySize: log.requestBody?.byteLength ?? 0
    },
    response: {
      status: log.status ?? 0,
      statusText: '',
      httpVersion: '',
      cookies: [],
      headers: toHarHeaders(log.responseHeaders),
      content: {
        size: log.responseBody?.byteLength ?? 0,
        mimeType: log.responseBody?.contentType ?? 'application/octet-stream',
        text: responseBody?.content
      },
      redirectURL: redirectUrl,
      headersSize: -1,
      bodySize: log.responseBody?.byteLength ?? 0
    },
    cache: {},
    timings: {
      blocked: -1,
      dns: -1,
      connect: -1,
      send: 0,
      wait: durationMs,
      receive: 0,
      ssl: -1
    },
    comment: log.networkError ? '通信エラー。生のエラー文字列はエクスポートしていません。' : undefined,
    _stackpilot: {
      id: log.id,
      resourceType: log.resourceType,
      sanitized: true,
      requestBodyUnavailableReason: log.requestBody?.kind === 'unavailable'
        ? log.requestBody.unavailableReason
        : undefined,
      responseBodyUnavailableReason: log.responseBody?.kind === 'unavailable'
        ? log.responseBody.unavailableReason
        : undefined,
      updatedAt: log.updatedAt
    }
  };
};

const canExportRequestBody = (
  body?: SafeRequestBodyPreview
): body is SafeRequestBodyPreview & { content: string } =>
  Boolean(body && body.kind !== 'unavailable' && body.content && !body.isTruncated);

const toHarHeaders = (headers: Record<string, string>): Array<{ name: string; value: string }> =>
  Object.entries(headers).map(([name, value]) => ({ name, value }));

const toHarQueryString = (value: string): Array<{ name: string; value: string }> => {
  try {
    const url = new URL(value);
    return [...url.searchParams.entries()].map(([name, itemValue]) => ({ name, value: itemValue }));
  } catch {
    return [];
  }
};

const getHeaderValue = (headers: Record<string, string>, targetName: string): string | undefined => {
  const target = targetName.toLowerCase();
  return Object.entries(headers).find(([name]) => name.toLowerCase() === target)?.[1];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
