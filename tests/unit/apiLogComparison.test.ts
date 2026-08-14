import { describe, expect, it } from 'vitest';
import {
  compareNetworkLogs,
  createApiLogComparisonSummary,
  createApiLogComparisonView,
  reconcileComparisonLogIds,
  selectComparisonLogs,
  toggleComparisonLogId
} from '../../shared/domain/apiLogComparison';
import type { NetworkLog } from '../../shared/domain/inspector';

const createLog = (overrides: Partial<NetworkLog> = {}): NetworkLog => ({
  id: 'log-1',
  workspaceId: 'workspace-1',
  tabId: 'tab-1',
  resourceType: 'xhr',
  method: 'GET',
  url: 'https://api.example.test/users/1',
  status: 200,
  durationMs: 80,
  requestHeaders: {
    Accept: 'application/json',
    'x-request-id': 'request-1'
  },
  responseHeaders: {
    'content-type': 'application/json'
  },
  requestBody: {
    kind: 'json',
    contentType: 'application/json',
    content: '{"name":"alice","token":"<redacted>"}',
    byteLength: 48,
    isTruncated: false,
    redactedFieldPaths: ['token']
  },
  responseBody: {
    kind: 'json',
    contentType: 'application/json',
    content: '{"ok":true}',
    byteLength: 11,
    isTruncated: false,
    redactedFieldPaths: []
  },
  startedAt: 1_000,
  ...overrides
});

const logs = [
  createLog(),
  createLog({ id: 'log-2', method: 'POST', url: 'https://api.example.test/users/2' }),
  createLog({ id: 'log-3', method: 'DELETE', url: 'https://api.example.test/users/3' })
];

describe('API通信の比較対象', () => {
  it('存在するIDだけを重複なく最大2件へ補正する', () => {
    expect(reconcileComparisonLogIds(logs, ['missing', 'log-2', 'log-2', 'log-1', 'log-3'])).toEqual([
      'log-2',
      'log-1'
    ]);
  });

  it('2件を上限に追加し、選択済みIDは解除する', () => {
    const first = toggleComparisonLogId(logs, [], 'log-1');
    const second = toggleComparisonLogId(logs, first, 'log-2');
    const full = toggleComparisonLogId(logs, second, 'log-3');
    const removed = toggleComparisonLogId(logs, full, 'log-1');

    expect(first).toEqual(['log-1']);
    expect(second).toEqual(['log-1', 'log-2']);
    expect(full).toEqual(['log-1', 'log-2']);
    expect(removed).toEqual(['log-2']);
  });

  it('比較A/Bの指定順を維持してログを取得する', () => {
    expect(selectComparisonLogs(logs, ['log-3', 'log-1']).map((log) => log.id)).toEqual([
      'log-3',
      'log-1'
    ]);
  });
});

describe('API通信の差分判定', () => {
  it('概要とheaderの追加・削除・値変更を判定する', () => {
    const left = createLog();
    const right = createLog({
      id: 'log-2',
      resourceType: 'fetch',
      method: 'POST',
      url: 'https://api.example.test/users/2',
      status: 503,
      durationMs: 240,
      requestHeaders: {
        accept: 'application/json',
        'x-request-id': 'request-2',
        'x-retry-mode': 'manual'
      },
      responseHeaders: {
        'content-type': 'application/json',
        'retry-after': '30'
      }
    });

    const result = compareNetworkLogs(left, right);

    expect(result.hasDifferences).toBe(true);
    expect(result.summary.find((row) => row.key === 'status')?.difference).toBe('different');
    expect(result.requestHeaders.find((row) => row.name === 'accept')?.difference).toBe('same');
    expect(result.requestHeaders.find((row) => row.name === 'x-request-id')?.difference).toBe('different');
    expect(result.requestHeaders.find((row) => row.name === 'x-retry-mode')?.difference).toBe('right-only');
    expect(result.responseHeaders.find((row) => row.name === 'retry-after')?.difference).toBe('right-only');
  });

  it('差分のみ表示では同一項目を除外して件数を返す', () => {
    const comparison = compareNetworkLogs(
      createLog(),
      createLog({
        id: 'log-2',
        status: 503,
        requestHeaders: {
          accept: 'application/json',
          'x-request-id': 'request-2'
        }
      })
    );

    const all = createApiLogComparisonView(comparison, false);
    const differences = createApiLogComparisonView(comparison, true);

    expect(all.counts.total).toBeGreaterThan(all.counts.different);
    expect(all.counts.visible).toBe(all.counts.total);
    expect(differences.counts.visible).toBe(differences.counts.different);
    expect(differences.summary.every((row) => row.difference !== 'same')).toBe(true);
    expect(differences.requestHeaders.every((row) => row.difference !== 'same')).toBe(true);
    expect(differences.requestBody).toBeUndefined();
    expect(differences.responseBody).toBeUndefined();
  });

  it('差分がない場合は差分のみ表示件数を0件にする', () => {
    const left = createLog();
    const comparison = compareNetworkLogs(left, { ...left, id: 'log-2' });
    const view = createApiLogComparisonView(comparison, true);

    expect(view.hasDifferences).toBe(false);
    expect(view.counts.different).toBe(0);
    expect(view.counts.visible).toBe(0);
    expect(view.summary).toEqual([]);
  });

  it('JSONの空白差は整形後に同一と判定する', () => {
    const left = createLog({
      requestBody: {
        kind: 'json',
        contentType: 'application/json',
        content: '{"user":{"id":1,"name":"alice"}}',
        byteLength: 32,
        isTruncated: false,
        redactedFieldPaths: []
      }
    });
    const right = createLog({
      id: 'log-2',
      requestBody: {
        kind: 'json',
        contentType: 'application/json',
        content: '{\n  "user": { "id": 1, "name": "alice" }\n}',
        byteLength: 32,
        isTruncated: false,
        redactedFieldPaths: []
      }
    });

    expect(compareNetworkLogs(left, right).requestBody.difference).toBe('same');
  });

  it('bodyの内容・取得状態・伏字項目の差を判定する', () => {
    const left = createLog();
    const right = createLog({
      id: 'log-2',
      requestBody: {
        kind: 'unavailable',
        contentType: 'application/octet-stream',
        byteLength: 128,
        isTruncated: false,
        redactedFieldPaths: [],
        unavailableReason: 'unsupported-content-type'
      },
      responseBody: {
        kind: 'json',
        contentType: 'application/json',
        content: '{"ok":false,"reason":"retry"}',
        byteLength: 29,
        isTruncated: false,
        redactedFieldPaths: ['reason']
      }
    });

    const result = compareNetworkLogs(left, right);

    expect(result.requestBody.difference).toBe('different');
    expect(result.responseBody.difference).toBe('different');
    expect(result.responseBody.right.redactedFieldPaths).toEqual(['reason']);
  });
});

describe('API通信の主要差分サマリー', () => {
  it('成功系から非成功系への変化を要確認としてquery・duration・header・body差分を集約する', () => {
    const left = createLog({
      url: 'https://api.example.test/users?tag=a&tag=b&page=1',
      durationMs: 80
    });
    const right = createLog({
      id: 'log-2',
      url: 'https://api.example.test/users?tag=a&tag=c&flag=',
      status: 503,
      durationMs: 120,
      requestHeaders: {
        accept: 'application/json',
        'x-request-id': 'request-2',
        'x-retry-mode': 'manual'
      },
      responseHeaders: {
        'content-type': 'application/json',
        'retry-after': '30'
      },
      responseBody: {
        kind: 'json',
        contentType: 'application/json',
        content: '{"ok":false}',
        byteLength: 12,
        isTruncated: false,
        redactedFieldPaths: []
      }
    });

    const summary = createApiLogComparisonSummary(left, right);

    expect(summary.verdict).toBe('attention');
    expect(summary.status).toMatchObject({
      kind: 'success-to-non-success',
      left: '200',
      right: '503',
      label: '成功系 → 非成功系'
    });
    expect(summary.duration).toEqual({ deltaMs: 40, percent: 50, label: '+40ms (+50%)' });
    expect(summary.query).toEqual({
      comparable: true,
      added: 1,
      changed: 1,
      removed: 1,
      label: '追加 1 / 変更 1 / 削除 1'
    });
    expect(summary.requestHeaders).toEqual({ different: 2, total: 3 });
    expect(summary.responseHeaders).toEqual({ different: 1, total: 2 });
    expect(summary.requestBodyChanged).toBe(false);
    expect(summary.responseBodyChanged).toBe(true);
  });

  it('非成功系から成功系への変化は差分ありとして扱い、改善とは断定しない', () => {
    const summary = createApiLogComparisonSummary(
      createLog({ status: 404 }),
      createLog({ id: 'log-2', status: 204 })
    );

    expect(summary.verdict).toBe('different');
    expect(summary.status.kind).toBe('non-success-to-success');
    expect(summary.status.label).toBe('非成功系 → 成功系');
  });

  it('差分がない通信は差分なしとして0件サマリーを返す', () => {
    const left = createLog({ url: 'https://api.example.test/users?tag=a&tag=b' });
    const summary = createApiLogComparisonSummary(left, { ...left, id: 'log-2' });

    expect(summary.verdict).toBe('same');
    expect(summary.status.kind).toBe('same');
    expect(summary.duration).toEqual({ deltaMs: 0, percent: 0, label: '0ms (0%)' });
    expect(summary.query).toMatchObject({ added: 0, changed: 0, removed: 0 });
    expect(summary.requestHeaders.different).toBe(0);
    expect(summary.responseHeaders.different).toBe(0);
    expect(summary.requestBodyChanged).toBe(false);
    expect(summary.responseBodyChanged).toBe(false);
  });

  it('URLを解釈できない場合はqueryだけ比較不可として全体比較を継続する', () => {
    const summary = createApiLogComparisonSummary(
      createLog({ url: 'not-a-url' }),
      createLog({ id: 'log-2', url: 'still-not-a-url' })
    );

    expect(summary.verdict).toBe('different');
    expect(summary.query).toEqual({
      comparable: false,
      added: 0,
      changed: 0,
      removed: 0,
      label: '比較不可'
    });
  });
});
