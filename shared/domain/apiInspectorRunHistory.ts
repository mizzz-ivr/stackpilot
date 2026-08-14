import type { NetworkLog } from './inspector';

export const maxApiInspectorRunHistoryEntriesPerWorkspace = 20;

export interface ApiInspectorRunQueryEntry {
  name: string;
  value: string;
}

export interface ApiInspectorRunHistoryEntry {
  id: string;
  workspaceId: string;
  sourceLogId: string;
  resultLogId?: string;
  method: string;
  targetUrl: string;
  queryEntries: ApiInspectorRunQueryEntry[];
  responseStatus: number;
  durationMs: number;
  executedAt: number;
}

export const appendApiInspectorRunHistory = (
  history: ApiInspectorRunHistoryEntry[],
  entry: ApiInspectorRunHistoryEntry
): ApiInspectorRunHistoryEntry[] => {
  let workspaceEntryCount = 0;
  return [entry, ...history.filter((item) => item.id !== entry.id)].filter((item) => {
    if (item.workspaceId !== entry.workspaceId) return true;
    workspaceEntryCount += 1;
    return workspaceEntryCount <= maxApiInspectorRunHistoryEntriesPerWorkspace;
  });
};

export const selectApiInspectorRunHistory = (
  history: ApiInspectorRunHistoryEntry[],
  workspaceId?: string
): ApiInspectorRunHistoryEntry[] =>
  workspaceId ? history.filter((entry) => entry.workspaceId === workspaceId) : [];

export const clearApiInspectorRunHistory = (
  history: ApiInspectorRunHistoryEntry[],
  workspaceId: string
): ApiInspectorRunHistoryEntry[] =>
  history.filter((entry) => entry.workspaceId !== workspaceId);

export const collectApiInspectorRunHistoryProtectedLogIds = (
  history: ApiInspectorRunHistoryEntry[],
  workspaceId: string
): string[] => {
  const ids = new Set<string>();
  for (const entry of history) {
    if (entry.workspaceId !== workspaceId) continue;
    ids.add(entry.sourceLogId);
    if (entry.resultLogId) ids.add(entry.resultLogId);
  }
  return [...ids];
};

export const canCompareApiInspectorRunHistoryEntry = (
  entry: ApiInspectorRunHistoryEntry,
  logs: NetworkLog[]
): boolean => {
  if (!entry.resultLogId || entry.sourceLogId === entry.resultLogId) return false;
  const availableIds = new Set(logs.map((log) => log.id));
  return availableIds.has(entry.sourceLogId) && availableIds.has(entry.resultLogId);
};
