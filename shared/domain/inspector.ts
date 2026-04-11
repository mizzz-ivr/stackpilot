import type { ApiLogEntry } from '../contracts';

export type ResourceType = 'xhr' | 'fetch' | 'other';

export interface NetworkLog {
  id: string;
  workspaceId: string;
  tabId: string;
  resourceType: ResourceType;
  method: string;
  url: string;
  status?: number;
  durationMs?: number;
  startedAt: number;
  finishedAt?: number;
}

export interface InspectorFilter {
  kind: 'all' | 'xhr' | 'fetch';
}

export interface InspectorState {
  logs: NetworkLog[];
  filter: InspectorFilter;
  isLoading: boolean;
  errorMessage?: string;
}

export const defaultInspectorFilter: InspectorFilter = { kind: 'all' };

export const createInitialInspectorState = (): InspectorState => ({
  logs: [],
  filter: defaultInspectorFilter,
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
  startedAt: entry.startedAt,
  finishedAt: entry.finishedAt
});

export const filterLogs = (logs: NetworkLog[], filter: InspectorFilter): NetworkLog[] => {
  if (filter.kind === 'all') return logs;
  return logs.filter((log) => log.resourceType === filter.kind);
};

export const formatMethodLabel = (method: string): string => method.toUpperCase();

export const formatDurationLabel = (durationMs?: number): string => {
  if (typeof durationMs !== 'number') return '-';
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(2)}s`;
};

export const getStatusTone = (status?: number): string => {
  if (typeof status !== 'number') return 'text-slate-400';
  if (status >= 500) return 'text-rose-300';
  if (status >= 400) return 'text-amber-300';
  if (status >= 300) return 'text-cyan-300';
  if (status >= 200) return 'text-emerald-300';
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
