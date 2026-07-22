import { describe, expect, it } from 'vitest';
import {
  createPayloadPreview,
  filterLogs,
  findSelectedLog,
  formatDurationLabel,
  formatMethodLabel,
  getStatusKind,
  getStatusTone,
  toHeaderEntries,
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
    requestHeaders: { accept: 'application/json' },
    responseHeaders: { 'content-type': 'application/json' },
    responseBodySnippet: '{"id":1,"name":"test"}',
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
    requestHeaders: {},
    responseHeaders: {},
    responseBodySnippet: 'Internal Server Error',
    startedAt: 2
  }
];

describe('inspector domain', () => {
  it('filterLogs はフィルタに応じて絞り込む', () => {
    expect(filterLogs(logs, { kind: 'all' })).toHaveLength(2);
    expect(filterLogs(logs, { kind: 'xhr' })).toHaveLength(1);
    expect(filterLogs(logs, { kind: 'fetch' })).toHaveLength(1);
  });

  it('選択IDから通信ログを解決する', () => {
    expect(findSelectedLog(logs, '2')?.url).toBe('https://example.com/v1/tasks');
    expect(findSelectedLog(logs, 'missing')).toBeUndefined();
    expect(findSelectedLog(logs)).toBeUndefined();
  });

  it('表示ルールをフォーマットする', () => {
    expect(formatMethodLabel('post')).toBe('POST');
    expect(formatDurationLabel(120)).toBe('120ms');
    expect(formatDurationLabel(1420)).toBe('1.42s');
    expect(formatDurationLabel()).toBe('-');
    expect(getStatusKind(200)).toBe('success');
    expect(getStatusKind(404)).toBe('client-error');
    expect(getStatusKind(500)).toBe('server-error');
    expect(getStatusTone(200)).toContain('emerald');
    expect(getStatusTone(500)).toContain('rose');
  });

  it('ヘッダーを名前順の表示配列へ変換する', () => {
    expect(toHeaderEntries({ zeta: '2', accept: 'application/json' })).toEqual([
      { name: 'accept', value: 'application/json' },
      { name: 'zeta', value: '2' }
    ]);
  });

  it('JSON本文を整形して長い本文を切り詰める', () => {
    const json = createPayloadPreview('{"id":1,"name":"test"}');
    expect(json.kind).toBe('json');
    expect(json.content).toContain('\n  "name": "test"');
    expect(json.isTruncated).toBe(false);

    const truncated = createPayloadPreview('123456', 4);
    expect(truncated.kind).toBe('json');
    expect(truncated.content).toBe('1234\n…');
    expect(truncated.isTruncated).toBe(true);

    expect(createPayloadPreview()).toEqual({
      kind: 'empty',
      content: '本文は取得されていません。',
      isTruncated: false
    });
  });

  it('URLからパスを生成する', () => {
    expect(toPathLabel('https://example.com/v1/users?id=1')).toBe('/v1/users?id=1');
    expect(toPathLabel('invalid-url')).toBe('invalid-url');
  });
});
