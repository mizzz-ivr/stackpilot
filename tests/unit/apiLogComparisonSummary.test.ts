import { describe, expect, it } from 'vitest';
import { createApiLogComparisonSummary } from '../../shared/domain/apiLogComparison';
import type { NetworkLog } from '../../shared/domain/inspector';

const createLog = (overrides: Partial<NetworkLog> = {}): NetworkLog => ({
  id: 'log-1',
  workspaceId: 'workspace-1',
  tabId: 'tab-1',
  resourceType: 'xhr',
  method: 'GET',
  url: 'https://api.example.test/items?tag=a&tag=b',
  status: 200,
  durationMs: 100,
  requestHeaders: {},
  responseHeaders: {},
  startedAt: 1_000,
  ...overrides
});

describe('API通信比較サマリーの境界値', () => {
  it('durationが未計測の通信ではdurationだけ比較不可として扱う', () => {
    const summary = createApiLogComparisonSummary(
      createLog({ durationMs: undefined }),
      createLog({ id: 'log-2', durationMs: 120 })
    );

    expect(summary.duration).toEqual({ label: '比較不可' });
    expect(summary.verdict).toBe('different');
  });

  it('2xxから通信エラーへの変化は要確認として扱う', () => {
    const summary = createApiLogComparisonSummary(
      createLog({ status: 204 }),
      createLog({ id: 'log-2', status: undefined })
    );

    expect(summary.verdict).toBe('attention');
    expect(summary.status).toMatchObject({
      kind: 'success-to-non-success',
      left: '204',
      right: '通信エラー',
      label: '成功系 → 非成功系'
    });
  });

  it('同名queryは出現順で比較する', () => {
    const summary = createApiLogComparisonSummary(
      createLog({ url: 'https://api.example.test/items?tag=a&tag=b&tag=c' }),
      createLog({ id: 'log-2', url: 'https://api.example.test/items?tag=a&tag=x&tag=c&tag=d' })
    );

    expect(summary.query).toEqual({
      comparable: true,
      added: 1,
      changed: 1,
      removed: 0,
      label: '追加 1 / 変更 1 / 削除 0'
    });
  });
});
