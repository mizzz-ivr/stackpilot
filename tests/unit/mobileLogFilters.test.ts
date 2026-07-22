import { describe, expect, it } from 'vitest';
import type { NetworkLog } from '../../shared/domain/inspector';
import {
  defaultMobileLogFilterState,
  filterAndSortMobileLogs,
  hasActiveMobileLogFilters,
  isFailureLog,
  matchesMobileLogFilter,
  type MobileLogFilterState
} from '../../shared/domain/mobileLogFilters';

const createLog = (overrides: Partial<NetworkLog>): NetworkLog => ({
  id: 'log-default',
  workspaceId: 'workspace-1',
  tabId: 'tab-1',
  resourceType: 'fetch',
  method: 'GET',
  url: 'https://example.com/api/users?page=1',
  status: 200,
  durationMs: 42,
  requestHeaders: {},
  responseHeaders: {},
  startedAt: 1,
  finishedAt: 43,
  ...overrides
});

const logs: NetworkLog[] = [
  createLog({ id: 'get-users', method: 'GET', status: 200, url: 'https://example.com/api/users?page=1' }),
  createLog({ id: 'post-order', method: 'POST', status: 422, url: 'https://example.com/api/orders' }),
  createLog({ id: 'server-error', method: 'PATCH', status: 503, url: 'https://example.com/api/profile' }),
  createLog({ id: 'redirect', method: 'HEAD', status: 302, url: 'https://example.com/login' }),
  createLog({ id: 'network-error', method: 'GET', status: undefined, url: 'https://example.com/api/slow' })
];

const filter = (overrides: Partial<MobileLogFilterState>): MobileLogFilterState => ({
  ...defaultMobileLogFilterState,
  ...overrides
});

describe('mobile log filters', () => {
  it('URL・パス・Method・Statusを空白区切りのAND条件で検索する', () => {
    expect(matchesMobileLogFilter(logs[0], filter({ query: 'GET users 200' }))).toBe(true);
    expect(matchesMobileLogFilter(logs[0], filter({ query: 'GET orders' }))).toBe(false);
    expect(matchesMobileLogFilter(logs[1], filter({ query: '/api/orders 422' }))).toBe(true);
  });

  it('Methodを絞り込み、定義外Methodをその他として扱う', () => {
    expect(filterAndSortMobileLogs(logs, filter({ method: 'POST' }), new Set()).map((log) => log.id)).toEqual([
      'post-order'
    ]);
    expect(filterAndSortMobileLogs(logs, filter({ method: 'other' }), new Set()).map((log) => log.id)).toEqual([
      'redirect'
    ]);
  });

  it('Status区分で絞り込む', () => {
    expect(filterAndSortMobileLogs(logs, filter({ status: 'success' }), new Set()).map((log) => log.id)).toEqual([
      'get-users'
    ]);
    expect(filterAndSortMobileLogs(logs, filter({ status: 'client-error' }), new Set()).map((log) => log.id)).toEqual([
      'post-order'
    ]);
    expect(filterAndSortMobileLogs(logs, filter({ status: 'server-error' }), new Set()).map((log) => log.id)).toEqual([
      'server-error'
    ]);
    expect(filterAndSortMobileLogs(logs, filter({ status: 'unknown' }), new Set()).map((log) => log.id)).toEqual([
      'network-error'
    ]);
  });

  it('失敗通信として4xx・5xx・statusなしを扱う', () => {
    expect(logs.filter(isFailureLog).map((log) => log.id)).toEqual([
      'post-order',
      'server-error',
      'network-error'
    ]);
  });

  it('検索・Method・Status・失敗のみをAND条件で組み合わせる', () => {
    const result = filterAndSortMobileLogs(
      logs,
      filter({ query: 'api', method: 'PATCH', status: 'server-error', failuresOnly: true }),
      new Set()
    );

    expect(result.map((log) => log.id)).toEqual(['server-error']);
  });

  it('固定ログを上部へ移動し、各グループ内の元順序を維持する', () => {
    const originalIds = logs.map((log) => log.id);
    const result = filterAndSortMobileLogs(logs, defaultMobileLogFilterState, new Set(['server-error', 'get-users']));

    expect(result.map((log) => log.id)).toEqual([
      'get-users',
      'server-error',
      'post-order',
      'redirect',
      'network-error'
    ]);
    expect(logs.map((log) => log.id)).toEqual(originalIds);
  });

  it('フィルタが有効か判定する', () => {
    expect(hasActiveMobileLogFilters(defaultMobileLogFilterState)).toBe(false);
    expect(hasActiveMobileLogFilters(filter({ query: 'users' }))).toBe(true);
    expect(hasActiveMobileLogFilters(filter({ failuresOnly: true }))).toBe(true);
  });
});
