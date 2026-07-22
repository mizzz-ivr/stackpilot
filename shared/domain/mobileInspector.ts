import type { ApiLogEntry } from '../contracts';
import type { EnvironmentType } from './environment';
import { environmentTypes } from './environment';
import { toNetworkLog, type NetworkLog } from './inspector';

export interface MobileWorkspaceSummary {
  id: string;
  name: string;
  environmentType: EnvironmentType;
  customEnvironmentLabel?: string;
}

export interface MobileInspectorPayload {
  workspace: MobileWorkspaceSummary;
  logs: ApiLogEntry[];
  capturedAt: number;
  cursor: string;
}

export interface MobileInspectorSnapshot {
  workspace: MobileWorkspaceSummary;
  logs: NetworkLog[];
  capturedAt: number;
  cursor: string;
}

export const toMobileInspectorSnapshot = (payload: MobileInspectorPayload): MobileInspectorSnapshot => ({
  workspace: payload.workspace,
  logs: deduplicateNetworkLogs(payload.logs.map(toNetworkLog)),
  capturedAt: payload.capturedAt,
  cursor: payload.cursor
});

export const deduplicateNetworkLogs = (logs: NetworkLog[]): NetworkLog[] => {
  const seen = new Set<string>();
  return logs.filter((log) => {
    if (seen.has(log.id)) return false;
    seen.add(log.id);
    return true;
  });
};

export const isMobileInspectorPayload = (value: unknown): value is MobileInspectorPayload => {
  if (!isRecord(value) || !isRecord(value.workspace) || !Array.isArray(value.logs)) return false;

  const workspace = value.workspace;
  return (
    typeof workspace.id === 'string' &&
    typeof workspace.name === 'string' &&
    typeof workspace.environmentType === 'string' &&
    environmentTypes.includes(workspace.environmentType as EnvironmentType) &&
    (workspace.customEnvironmentLabel === undefined || typeof workspace.customEnvironmentLabel === 'string') &&
    typeof value.capturedAt === 'number' &&
    typeof value.cursor === 'string' &&
    value.cursor.length > 0 &&
    value.logs.every(isApiLogEntry)
  );
};

const isApiLogEntry = (value: unknown): value is ApiLogEntry => {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === 'string' &&
    typeof value.workspaceId === 'string' &&
    typeof value.tabId === 'string' &&
    (value.type === 'xhr' || value.type === 'fetch' || value.type === 'other') &&
    typeof value.method === 'string' &&
    typeof value.url === 'string' &&
    isStringRecord(value.requestHeaders) &&
    isStringRecord(value.responseHeaders) &&
    typeof value.startedAt === 'number' &&
    (value.status === undefined || typeof value.status === 'number') &&
    (value.durationMs === undefined || typeof value.durationMs === 'number') &&
    (value.responseBodySnippet === undefined || typeof value.responseBodySnippet === 'string') &&
    (value.finishedAt === undefined || typeof value.finishedAt === 'number')
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isStringRecord = (value: unknown): value is Record<string, string> =>
  isRecord(value) && Object.values(value).every((item) => typeof item === 'string');