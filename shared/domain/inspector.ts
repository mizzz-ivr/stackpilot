import type { ApiLogEntry } from '../contracts';

export type ResourceType = 'xhr' | 'fetch' | 'other';
export type InspectorStatusKind = 'unknown' | 'informational' | 'success' | 'redirect' | 'client-error' | 'server-error';
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
  responseHeaders: Record<string, string>;
  responseBodySnippet?: string;
  startedAt: number;
  finishedAt?: number;
}

export interface InspectorFilter {
  kind: 'all' | 'xhr' | 'fetch';
}

export interface InspectorState {
  logs: NetworkLog[];
  filter: InspectorFilter;
  selectedLogId?: string;
  isLoading: boolean;
  errorMessage?: string;
}

export const defaultInspectorFilter: InspectorFilter = { kind: 'all' };

export const createInitialInspectorState = (): InspectorState => ({
  logs: [],
  filter: defaultInspectorFilter,
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
  responseHeaders: entry.responseHeaders,
  responseBodySnippet: entry.responseBodySnippet,
  startedAt: entry.startedAt,
  finishedAt: entry.finishedAt
});

export const filterLogs = (logs: NetworkLog[], filter: InspectorFilter): NetworkLog[] => {
  if (filter.kind === 'all') return logs;
  return logs.filter((log) => log.resourceType === filter.kind);
};

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
