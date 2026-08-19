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
  responseStatus?: number;
  durationMs?: number;
  executedAt: number;
  isPinned: boolean;
}

export const appendApiInspectorRunHistory = (
  history: ApiInspectorRunHistoryEntry[],
  entry: ApiInspectorRunHistoryEntry
): ApiInspectorRunHistoryEntry[] => {
  const candidateHistory = [entry, ...history.filter((item) => item.id !== entry.id)];
  const workspaceEntries = candidateHistory.filter((item) => item.workspaceId === entry.workspaceId);
  const [newestEntry, ...existingEntries] = workspaceEntries;
  const prioritizedEntries = newestEntry
    ? [
        newestEntry,
        ...existingEntries.filter((item) => item.isPinned),
        ...existingEntries.filter((item) => !item.isPinned)
      ]
    : [];
  const retainedIds = new Set(
    prioritizedEntries
      .slice(0, maxApiInspectorRunHistoryEntriesPerWorkspace)
      .map((item) => item.id)
  );

  return candidateHistory.filter(
    (item) => item.workspaceId !== entry.workspaceId || retainedIds.has(item.id)
  );
};

export const selectApiInspectorRunHistory = (
  history: ApiInspectorRunHistoryEntry[],
  workspaceId?: string
): ApiInspectorRunHistoryEntry[] => {
  if (!workspaceId) return [];
  const workspaceEntries = history.filter((entry) => entry.workspaceId === workspaceId);
  return [
    ...workspaceEntries.filter((entry) => entry.isPinned),
    ...workspaceEntries.filter((entry) => !entry.isPinned)
  ];
};

export const toggleApiInspectorRunHistoryPin = (
  history: ApiInspectorRunHistoryEntry[],
  entryId: string
): ApiInspectorRunHistoryEntry[] =>
  history.map((entry) =>
    entry.id === entryId ? { ...entry, isPinned: !entry.isPinned } : entry
  );

export const clearApiInspectorRunHistory = (
  history: ApiInspectorRunHistoryEntry[],
  workspaceId: string
): ApiInspectorRunHistoryEntry[] =>
  history.filter((entry) => entry.workspaceId !== workspaceId);

export const parseApiInspectorRunQueryEntries = (urlValue: string): ApiInspectorRunQueryEntry[] => {
  try {
    const url = new URL(urlValue);
    return Array.from(url.searchParams.entries(), ([name, value]) => ({ name, value }));
  } catch {
    return [];
  }
};

export const canCompareApiInspectorRunHistoryEntry = (
  entry: ApiInspectorRunHistoryEntry,
  logs: NetworkLog[]
): boolean => {
  if (!entry.resultLogId || entry.sourceLogId === entry.resultLogId) return false;
  const availableIds = new Set(logs.map((log) => log.id));
  return availableIds.has(entry.sourceLogId) && availableIds.has(entry.resultLogId);
};
