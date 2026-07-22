import { describe, expect, it } from 'vitest';
import {
  isMobileInspectorPayload,
  toMobileInspectorSnapshot,
  type MobileInspectorPayload
} from '../../shared/domain/mobileInspector';

const validPayload: MobileInspectorPayload = {
  workspace: {
    id: 'workspace-1',
    name: 'Development',
    environmentType: 'dev'
  },
  capturedAt: 1000,
  cursor: 'cursor-1',
  logs: [
    {
      id: 'log-1',
      workspaceId: 'workspace-1',
      tabId: 'tab-1',
      type: 'fetch',
      method: 'GET',
      url: 'https://dev.example.com/api/health',
      status: 200,
      durationMs: 42,
      requestHeaders: { accept: 'application/json' },
      responseHeaders: { 'content-type': 'application/json' },
      responseBodySnippet: '{"ok":true}',
      startedAt: 900,
      finishedAt: 942
    }
  ]
};

describe('mobile inspector contract', () => {
  it('正しいpayloadを受け入れる', () => {
    expect(isMobileInspectorPayload(validPayload)).toBe(true);
  });

  it('不正な環境種別を拒否する', () => {
    expect(
      isMobileInspectorPayload({
        ...validPayload,
        workspace: { ...validPayload.workspace, environmentType: 'production' }
      })
    ).toBe(false);
  });

  it('カーソルがないpayloadを拒否する', () => {
    const withoutCursor: Record<string, unknown> = { ...validPayload };
    delete withoutCursor.cursor;
    expect(isMobileInspectorPayload(withoutCursor)).toBe(false);
  });

  it('API payloadを共通NetworkLogへ変換する', () => {
    const snapshot = toMobileInspectorSnapshot(validPayload);

    expect(snapshot.workspace.name).toBe('Development');
    expect(snapshot.cursor).toBe('cursor-1');
    expect(snapshot.logs).toHaveLength(1);
    expect(snapshot.logs[0]).toMatchObject({
      id: 'log-1',
      resourceType: 'fetch',
      requestHeaders: { accept: 'application/json' },
      responseHeaders: { 'content-type': 'application/json' }
    });
  });

  it('同じIDのログを重複表示しない', () => {
    const snapshot = toMobileInspectorSnapshot({
      ...validPayload,
      logs: [validPayload.logs[0], { ...validPayload.logs[0] }]
    });

    expect(snapshot.logs).toHaveLength(1);
  });

  it('ヘッダー型が不正なpayloadを拒否する', () => {
    const invalidPayload = {
      ...validPayload,
      logs: [{ ...validPayload.logs[0], requestHeaders: { accept: 123 } }]
    };

    expect(isMobileInspectorPayload(invalidPayload)).toBe(false);
  });
});
