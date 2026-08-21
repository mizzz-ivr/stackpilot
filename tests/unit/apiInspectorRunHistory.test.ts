import { describe, expect, it } from 'vitest';
import {
  appendApiInspectorRunHistory,
  canCompareApiInspectorRunHistoryEntry,
  clearApiInspectorRunHistory,
  maxApiInspectorRunHistoryEntriesPerWorkspace,
  parseApiInspectorRunQueryEntries,
  selectApiInspectorRunHistory,
  toggleApiInspectorRunHistoryPin,
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
  isPinned: false,
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

  it('ピン留め履歴を上部へ表示し、各グループの新しい順を維持する', () => {
    const history = [
      createHistoryEntry('newest', 'workspace-1', { executedAt: 3_000 }),
      createHistoryEntry('middle', 'workspace-1', { executedAt: 2_000 }),
      createHistoryEntry('pinned-old', 'workspace-1', { executedAt: 1_000, isPinned: true })
    ];

    expect(selectApiInspectorRunHistory(history, 'workspace-1').map((entry) => entry.id)).toEqual([
      'pinned-old',
      'newest',
      'middle'
    ]);
  });

  it('上限超過時は最新Replayを残し、既存の未ピン最古から優先して削除する', () => {
    let history: ApiInspectorRunHistoryEntry[] = [];
    for (let index = 0; index < maxApiInspectorRunHistoryEntriesPerWorkspace; index += 1) {
      history = appendApiInspectorRunHistory(history, createHistoryEntry(`entry-${index}`));
    }
    history = toggleApiInspectorRunHistoryPin(history, 'entry-0');

    history = appendApiInspectorRunHistory(history, createHistoryEntry('entry-20'));

    const workspaceHistory = selectApiInspectorRunHistory(history, 'workspace-1');
    expect(workspaceHistory).toHaveLength(maxApiInspectorRunHistoryEntriesPerWorkspace);
    expect(workspaceHistory.some((entry) => entry.id === 'entry-20')).toBe(true);
    expect(workspaceHistory.some((entry) => entry.id === 'entry-0')).toBe(true);
    expect(workspaceHistory.some((entry) => entry.id === 'entry-1')).toBe(false);
  });

  it('既存20件がすべてピン済みでも最新Replayを保持し、最古のピンが上限から外れる', () => {
    let history: ApiInspectorRunHistoryEntry[] = [];
    for (let index = 0; index < maxApiInspectorRunHistoryEntriesPerWorkspace; index += 1) {
      history = appendApiInspectorRunHistory(
        history,
        createHistoryEntry(`entry-${index}`, 'workspace-1', { isPinned: true })
      );
    }

    history = appendApiInspectorRunHistory(history, createHistoryEntry('latest'));

    const workspaceHistory = selectApiInspectorRunHistory(history, 'workspace-1');
    expect(workspaceHistory).toHaveLength(maxApiInspectorRunHistoryEntriesPerWorkspace);
    expect(workspaceHistory.some((entry) => entry.id === 'latest')).toBe(true);
    expect(workspaceHistory.some((entry) => entry.id === 'entry-0')).toBe(false);
    expect(workspaceHistory.filter((entry) => entry.isPinned)).toHaveLength(19);
  });

  it('ピン留めと解除を対象履歴だけへ反映する', () => {
    const history = [
      createHistoryEntry('one'),
      createHistoryEntry('two', 'workspace-2')
    ];

    const pinned = toggleApiInspectorRunHistoryPin(history, 'one');
    expect(pinned.find((entry) => entry.id === 'one')?.isPinned).toBe(true);
    expect(pinned.find((entry) => entry.id === 'two')?.isPinned).toBe(false);

    const unpinned = toggleApiInspectorRunHistoryPin(pinned, 'one');
    expect(unpinned.find((entry) => entry.id === 'one')?.isPinned).toBe(false);
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
      createHistoryEntry('one', 'workspace-1', { isPinned: true }),
      createHistoryEntry('two', 'workspace-2', { isPinned: true })
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
