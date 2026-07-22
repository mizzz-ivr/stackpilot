import { getStatusKind, toPathLabel, type NetworkLog } from './inspector';

export const mobileLogMethodFilters = ['all', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'other'] as const;
export const mobileLogStatusFilters = [
  'all',
  'success',
  'redirect',
  'client-error',
  'server-error',
  'unknown'
] as const;

export type MobileLogMethodFilter = (typeof mobileLogMethodFilters)[number];
export type MobileLogStatusFilter = (typeof mobileLogStatusFilters)[number];

export interface MobileLogFilterState {
  query: string;
  method: MobileLogMethodFilter;
  status: MobileLogStatusFilter;
  failuresOnly: boolean;
}

export const defaultMobileLogFilterState: MobileLogFilterState = {
  query: '',
  method: 'all',
  status: 'all',
  failuresOnly: false
};

const commonMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export const filterAndSortMobileLogs = (
  logs: NetworkLog[],
  filter: MobileLogFilterState,
  pinnedLogIds: ReadonlySet<string>
): NetworkLog[] => {
  const tokens = normalizeSearchTokens(filter.query);
  const pinned: NetworkLog[] = [];
  const unpinned: NetworkLog[] = [];

  for (const log of logs) {
    if (!matchesMobileLogFilter(log, filter, tokens)) continue;

    if (pinnedLogIds.has(log.id)) {
      pinned.push(log);
    } else {
      unpinned.push(log);
    }
  }

  return [...pinned, ...unpinned];
};

export const matchesMobileLogFilter = (
  log: NetworkLog,
  filter: MobileLogFilterState,
  normalizedTokens = normalizeSearchTokens(filter.query)
): boolean => {
  if (!matchesMethod(log, filter.method)) return false;
  if (!matchesStatus(log, filter.status)) return false;
  if (filter.failuresOnly && !isFailureLog(log)) return false;
  if (normalizedTokens.length === 0) return true;

  const method = log.method.toUpperCase();
  const status = typeof log.status === 'number' ? String(log.status) : 'err';
  const searchable = `${method} ${status} ${log.url} ${toPathLabel(log.url)}`.toLowerCase();
  return normalizedTokens.every((token) => searchable.includes(token));
};

export const isFailureLog = (log: NetworkLog): boolean => {
  const statusKind = getStatusKind(log.status);
  return statusKind === 'client-error' || statusKind === 'server-error' || statusKind === 'unknown';
};

export const hasActiveMobileLogFilters = (filter: MobileLogFilterState): boolean =>
  filter.query.trim().length > 0 ||
  filter.method !== 'all' ||
  filter.status !== 'all' ||
  filter.failuresOnly;

const matchesMethod = (log: NetworkLog, methodFilter: MobileLogMethodFilter): boolean => {
  if (methodFilter === 'all') return true;

  const method = log.method.toUpperCase();
  if (methodFilter === 'other') return !commonMethods.has(method);
  return method === methodFilter;
};

const matchesStatus = (log: NetworkLog, statusFilter: MobileLogStatusFilter): boolean => {
  if (statusFilter === 'all') return true;

  const kind = getStatusKind(log.status);
  if (statusFilter === 'unknown') return kind === 'unknown' || kind === 'informational';
  return kind === statusFilter;
};

const normalizeSearchTokens = (query: string): string[] =>
  query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
