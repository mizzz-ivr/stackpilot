import type { ApiLogEntry } from '../contracts';
import type { SafeRequestBodyPreview } from './requestBody';
import type { SafeResponseBodyPreview } from './responseBody';

export type ResourceType = 'xhr' | 'fetch' | 'other';
export type InspectorStatusKind = 'unknown' | 'informational' | 'success' | 'redirect' | 'client-error' | 'server-error';
export type InspectorMethodFilterKind = 'all' | 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OTHER';
export type InspectorStatusFilterKind = 'all' | 'success' | 'redirect' | 'client-error' | 'server-error' | 'failed';
export type PayloadKind = 'empty' | 'json' | 'text';

export interface HeaderEntry {
  name: string;
  value: string;
}

export interface PayloadPreview {
  kind: PayloadKind;
  content: string;
  isTruncated: boolean;
}

export interface NetworkLog {
  id: string;
  workspaceId: string;
  tabId: string;
  resourceType: ResourceType;
  method: string;
  url: string;
  status?: number;
  durationMs?: number;
  requestHeaders: Record<string, string>;
  requestBody?: SafeRequestBodyPreview;
  responseHeaders: Record<string, string>;
  responseBody?: SafeResponseBodyPreview;
  responseBodySnippet?: string;
  startedAt: number;
  finishedAt?: number;
  updatedAt?: number;
}

export interface InspectorFilter {
  kind: 'all' | 'xhr' | 'fetch';
  query: string;
  method: InspectorMethodFilterKind;
  status: InspectorStatusFilterKind;
  pinnedOnly: boolean;
}

export interface InspectorState {
  logs: NetworkLog[];
  filter: InspectorFilter;
  pinnedLogIds: string[];
  selectedLogId?: string;
  isLoading: boolean;
  errorMessage?: string;
}

export const defaultInspectorFilter: InspectorFilter = {
  kind: 'all',
  query: '',
  method: 'all',
  status: 'all',
  pinnedOnly: false
};

export const createInitialInspectorState = (): InspectorState => ({
  logs: [],
  filter: { ...defaultInspectorFilter },
  pinnedLogIds: [],
  selectedLogId: undefined,
  isLoading: false,
  errorMessage: undefined
});

export const toNetworkLog = (entry: ApiLogEntry): NetworkLog => ({
  id: entry.id,
  workspaceId: entry.workspaceId,
  tabId: entry.tabId,
  resourceType: entry.type,
  method: entry.method,
  url: entry.url,
  status: entry.status,
  durationMs: entry.durationMs,
  requestHeaders: entry.requestHeaders,
  requestBody: entry.requestBody,
  responseHeaders: entry.responseHeaders,
  responseBody: entry.responseBody,
  responseBodySnippet: entry.responseBodySnippet,
  startedAt: entry.startedAt,
  finishedAt: entry.finishedAt,
  updatedAt: entry.updatedAt
});

export const filterLogs = (
  logs: NetworkLog[],
  filter: InspectorFilter,
  pinnedLogIds: string[] = []
): NetworkLog[] => {
  const pinnedIds = new Set(pinnedLogIds);
  const query = normalizeSearchValue(filter.query);

  return logs
    .filter((log) => filter.kind === 'all' || log.resourceType === filter.kind)
    .filter((log) => matchesMethodFilter(log, filter.method))
    .filter((log) => matchesStatusFilter(log, filter.status))
    .filter((log) => !filter.pinnedOnly || pinnedIds.has(log.id))
    .filter((log) => query.length === 0 || createSearchText(log).includes(query))
    .sort((left, right) => Number(pinnedIds.has(right.id)) - Number(pinnedIds.has(left.id)));
};

export const hasActiveInspectorFilters = (filter: InspectorFilter): boolean =>
  filter.kind !== defaultInspectorFilter.kind ||
  normalizeSearchValue(filter.query).length > 0 ||
  filter.method !== defaultInspectorFilter.method ||
  filter.status !== defaultInspectorFilter.status ||
  filter.pinnedOnly;

export const findSelectedLog = (logs: NetworkLog[], selectedLogId?: string): NetworkLog | undefined => {
  if (!selectedLogId) return undefined;
  return logs.find((log) => log.id === selectedLogId);
};

export const toHeaderEntries = (headers: Record<string, string>): HeaderEntry[] =>
  Object.entries(headers)
    .map(([name, value]) => ({ name, value }))
    .sort((left, right) => left.name.localeCompare(right.name));

export const createPayloadPreview = (body?: string, maxLength = 8000): PayloadPreview => {
  if (!body?.trim()) {
    return {
      kind: 'empty',
      content: '本文は取得されていません。',
      isTruncated: false
    };
  }

  const source = body.trim();
  let kind: PayloadKind = 'text';
  let content = source;

  try {
    content = JSON.stringify(JSON.parse(source), null, 2);
    kind = 'json';
  } catch {
    // JSON以外は取得したテキストをそのまま表示する。
  }

  const isTruncated = content.length > maxLength;
  return {
    kind,
    content: isTruncated ? `${content.slice(0, maxLength)}\n…` : content,
    isTruncated
  };
};

export const formatMethodLabel = (method: string): string => method.toUpperCase();

export const formatDurationLabel = (durationMs?: number): string => {
  if (typeof durationMs !== 'number') return '-';
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(2)}s`;
};

export const formatStartedAtLabel = (startedAt: number): string =>
  new Date(startedAt).toLocaleTimeString('ja-JP', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

export const getStatusKind = (status?: number): InspectorStatusKind => {
  if (typeof status !== 'number') return 'unknown';
  if (status >= 500) return 'server-error';
  if (status >= 400) return 'client-error';
  if (status >= 300) return 'redirect';
  if (status >= 200) return 'success';
  if (status >= 100) return 'informational';
  return 'unknown';
};

export const getStatusTone = (status?: number): string => {
  const kind = getStatusKind(status);
  if (kind === 'server-error') return 'text-rose-300';
  if (kind === 'client-error') return 'text-amber-300';
  if (kind === 'redirect') return 'text-cyan-300';
  if (kind === 'success') return 'text-emerald-300';
  return 'text-slate-400';
};

export const toPathLabel = (url: string): string => {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
};

const matchesMethodFilter = (log: NetworkLog, method: InspectorMethodFilterKind): boolean => {
  if (method === 'all') return true;
  const normalizedMethod = formatMethodLabel(log.method);
  if (method === 'OTHER') {
    return !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(normalizedMethod);
  }
  return normalizedMethod === method;
};

const matchesStatusFilter = (log: NetworkLog, status: InspectorStatusFilterKind): boolean => {
  if (status === 'all') return true;
  if (status === 'failed') return typeof log.status !== 'number';
  return getStatusKind(log.status) === status;
};

const createSearchText = (log: NetworkLog): string =>
  normalizeSearchValue([
    log.method,
    log.url,
    toPathLabel(log.url),
    log.resourceType,
    typeof log.status === 'number' ? String(log.status) : '通信エラー failed error',
    ...Object.entries(log.requestHeaders).flat(),
    ...Object.entries(log.responseHeaders).flat()
  ].join(' '));

const normalizeSearchValue = (value: string): string =>
  value.normalize('NFKC').trim().toLocaleLowerCase('ja-JP');
