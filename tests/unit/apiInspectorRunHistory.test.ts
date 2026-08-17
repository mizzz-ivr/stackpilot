import { describe, expect, it } from 'vitest';
import {
  appendApiInspectorRunHistory,
  canCompareApiInspectorRunHistoryEntry,
  clearApiInspectorRunHistory,
  maxApiInspectorRunHistoryEntriesPerWorkspace,
  parseApiInspectorRunQueryEntries,
  selectApiInspectorRunHistory,
  type ApiInspectorRunHistoryEntry
} from '../../shared/domain/apiInspectorRunHistory';
import type { NetworkLog } from '../../shared/domain/inspector';

const createHistoryEntry = (
  id: string,
  workspaceId = 'workspace-1',
  overrides: Partial<ApiInspectorRunHistoryEntry> = {}
): ApiInspectorRunHistoryEntry => ({
  id,
  workspaceId,
  sourceLogId: `source-${id}`,
  resultLogId: `result-${id}`,
  method: 'GET',
  targetUrl: `https://api.example.test/items?run=${id}`,
  queryEntries: [{ name: 'run', value: id }],
  responseStatus: 200,
  durationMs: 80,
  executedAt: 1_000,
  ...overrides
});

const createLog = (id: string): NetworkLog => ({
  id,
  workspaceId: 'workspace-1',
  tabId: 'tab-1',
  resourceType: 'xhr',
  method: 'GET',
  url: `https://api.example.test/${id}`,
  status: 200,
  durationMs: 80,
  requestHeaders: {},
  responseHeaders: {},
  startedAt: 1_000
});

describe('API Inspector実行履歴', () => {
  it('Workspaceごとに新しい順で最大20件だけ保持する', () => {
    let history: ApiInspectorRunHistoryEntry[] = [createHistoryEntry('other', 'workspace-2')];

    for (let index = 0; index < maxApiInspectorRunHistoryEntriesPerWorkspace + 3; index += 1) {
      history = appendApiInspectorRunHistory(history, createHistoryEntry(`entry-${index}`));
    }

    const workspaceHistory = selectApiInspectorRunHistory(history, 'workspace-1');
    expect(workspaceHistory).toHaveLength(maxApiInspectorRunHistoryEntriesPerWorkspace);
    expect(workspaceHistory[0]?.id).toBe('entry-22');
    expect(workspaceHistory.at(-1)?.id).toBe('entry-3');
    expect(selectApiInspectorRunHistory(history, 'workspace-2').map((entry) => entry.id)).toEqual(['other']);
  });

  it('同じIDを再追加した場合は重複させず先頭へ移動する', () => {
    const first = createHistoryEntry('same', 'workspace-1', { executedAt: 1_000 });
    const second = createHistoryEntry('same', 'workspace-1', { executedAt: 2_000, durationMs: 120 });

    const history = appendApiInspectorRunHistory([first], second);

    expect(history).toHaveLength(1);
    expect(history[0]?.executedAt).toBe(2_000);
    expect(history[0]?.durationMs).toBe(120);
  });

  it('指定Workspaceの履歴だけをクリアする', () => {
    const history = [
      createHistoryEntry('one'),
      createHistoryEntry('two', 'workspace-2')
    ];

    expect(clearApiInspectorRunHistory(history, 'workspace-1').map((entry) => entry.id)).toEqual(['two']);
  });

  it('URLから同名queryを出現順のまま取得する', () => {
    expect(parseApiInspectorRunQueryEntries('https://api.example.test/items?tag=a&tag=b&flag=')).toEqual([
      { name: 'tag', value: 'a' },
      { name: 'tag', value: 'b' },
      { name: 'flag', value: '' }
    ]);
    expect(parseApiInspectorRunQueryEntries('not-a-url')).toEqual([]);
  });

  it('元ログと結果ログの両方が残っている場合だけ比較へ復元できる', () => {
    const entry = createHistoryEntry('one', 'workspace-1', {
      sourceLogId: 'source-1',
      resultLogId: 'result-1'
    });
    const logs = [createLog('source-1'), createLog('result-1')];

    expect(canCompareApiInspectorRunHistoryEntry(entry, logs)).toBe(true);
    expect(canCompareApiInspectorRunHistoryEntry(entry, [createLog('source-1')])).toBe(false);
    expect(canCompareApiInspectorRunHistoryEntry({ ...entry, resultLogId: undefined }, logs)).toBe(false);
    expect(canCompareApiInspectorRunHistoryEntry({ ...entry, resultLogId: 'source-1' }, logs)).toBe(false);
  });
});
