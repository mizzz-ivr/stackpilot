import { describe, expect, it } from 'vitest';
import {
  defaultInspectorFilter,
  filterLogs,
  hasActiveInspectorFilters,
  type InspectorFilter,
  type NetworkLog
} from '../../shared/domain/inspector';

const createLog = (overrides: Partial<NetworkLog> = {}): NetworkLog => ({
  id: 'log-1',
  workspaceId: 'workspace-1',
  tabId: 'tab-1',
  resourceType: 'fetch',
  method: 'GET',
  url: 'https://example.com/api/users?role=admin',
  status: 200,
  durationMs: 80,
  requestHeaders: {
    accept: 'application/json',
    'x-request-id': 'request-001'
  },
  responseHeaders: {
    'content-type': 'application/json',
    'x-trace-id': 'trace-001'
  },
  startedAt: 1_000,
  ...overrides
});

const logs: NetworkLog[] = [
  createLog(),
  createLog({
    id: 'log-2',
    resourceType: 'xhr',
    method: 'POST',
    url: 'https://example.com/api/orders',
    status: 404,
    requestHeaders: { 'x-customer-code': 'customer-blue' },
    responseHeaders: {}
  }),
  createLog({
    id: 'log-3',
    method: 'PATCH',
    url: 'https://example.com/api/profile',
    status: 503,
    requestHeaders: {},
    responseHeaders: { 'retry-after': '30' }
  }),
  createLog({
    id: 'log-4',
    method: 'OPTIONS',
    url: 'https://example.com/api/preflight',
    status: 204,
    requestHeaders: {},
    responseHeaders: {}
  }),
  createLog({
    id: 'log-5',
    method: 'GET',
    url: 'https://example.com/api/offline',
    status: undefined,
    requestHeaders: {},
    responseHeaders: {}
  })
];

const withFilter = (patch: Partial<InspectorFilter>): InspectorFilter => ({
  ...defaultInspectorFilter,
  ...patch
});

describe('API Inspectorの一覧フィルター', () => {
  it('URL・method・status・resource type・headerを大文字小文字を区別せず検索する', () => {
    expect(filterLogs(logs, withFilter({ query: 'USERS' })).map((log) => log.id)).toEqual(['log-1']);
    expect(filterLogs(logs, withFilter({ query: 'post' })).map((log) => log.id)).toEqual(['log-2']);
    expect(filterLogs(logs, withFilter({ query: '404' })).map((log) => log.id)).toEqual(['log-2']);
    expect(filterLogs(logs, withFilter({ query: 'xhr' })).map((log) => log.id)).toEqual(['log-2']);
    expect(filterLogs(logs, withFilter({ query: 'CUSTOMER-BLUE' })).map((log) => log.id)).toEqual(['log-2']);
    expect(filterLogs(logs, withFilter({ query: 'trace-001' })).map((log) => log.id)).toEqual(['log-1']);
  });

  it('resource type・method・statusを複合して絞り込む', () => {
    const result = filterLogs(logs, withFilter({
      kind: 'fetch',
      method: 'PATCH',
      status: 'server-error'
    }));

    expect(result.map((log) => log.id)).toEqual(['log-3']);
  });

  it('OTHER methodと通信失敗を判定する', () => {
    expect(filterLogs(logs, withFilter({ method: 'OTHER' })).map((log) => log.id)).toEqual(['log-4']);
    expect(filterLogs(logs, withFilter({ status: 'failed' })).map((log) => log.id)).toEqual(['log-5']);
  });

  it('ピンのみ表示し、通常表示ではピンを一覧上部へ移動する', () => {
    const pinnedIds = ['log-3', 'log-2'];

    expect(filterLogs(logs, defaultInspectorFilter, pinnedIds).map((log) => log.id)).toEqual([
      'log-2',
      'log-3',
      'log-1',
      'log-4',
      'log-5'
    ]);
    expect(filterLogs(logs, withFilter({ pinnedOnly: true }), pinnedIds).map((log) => log.id)).toEqual([
      'log-2',
      'log-3'
    ]);
  });

  it('ピンのみと検索条件を同時に適用する', () => {
    const result = filterLogs(logs, withFilter({ query: 'orders', pinnedOnly: true }), ['log-2', 'log-3']);
    expect(result.map((log) => log.id)).toEqual(['log-2']);
  });

  it('初期条件と有効な絞り込みを判定する', () => {
    expect(hasActiveInspectorFilters(defaultInspectorFilter)).toBe(false);
    expect(hasActiveInspectorFilters(withFilter({ query: '  ' }))).toBe(false);
    expect(hasActiveInspectorFilters(withFilter({ method: 'POST' }))).toBe(true);
    expect(hasActiveInspectorFilters(withFilter({ pinnedOnly: true }))).toBe(true);
  });
});
