import { describe, expect, it } from 'vitest';
import {
  filterLogs,
  formatDurationLabel,
  formatMethodLabel,
  getStatusTone,
  toPathLabel,
  type NetworkLog
} from '../../shared/domain/inspector';

const logs: NetworkLog[] = [
  {
    id: '1',
    workspaceId: 'w1',
    tabId: 't1',
    resourceType: 'xhr',
    method: 'get',
    url: 'https://example.com/v1/users?id=1',
    status: 200,
    durationMs: 120,
    startedAt: 1
  },
  {
    id: '2',
    workspaceId: 'w1',
    tabId: 't1',
    resourceType: 'fetch',
    method: 'post',
    url: 'https://example.com/v1/tasks',
    status: 500,
    durationMs: 1420,
    startedAt: 2
  }
];

describe('inspector domain', () => {
  it('filterLogs はフィルタに応じて絞り込む', () => {
    expect(filterLogs(logs, { kind: 'all' })).toHaveLength(2);
    expect(filterLogs(logs, { kind: 'xhr' })).toHaveLength(1);
    expect(filterLogs(logs, { kind: 'fetch' })).toHaveLength(1);
  });

  it('表示ルールをフォーマットする', () => {
    expect(formatMethodLabel('post')).toBe('POST');
    expect(formatDurationLabel(120)).toBe('120ms');
    expect(formatDurationLabel(1420)).toBe('1.42s');
    expect(formatDurationLabel()).toBe('-');
    expect(getStatusTone(200)).toContain('emerald');
    expect(getStatusTone(500)).toContain('rose');
  });

  it('URLからパスを生成する', () => {
    expect(toPathLabel('https://example.com/v1/users?id=1')).toBe('/v1/users?id=1');
    expect(toPathLabel('invalid-url')).toBe('invalid-url');
  });
});
