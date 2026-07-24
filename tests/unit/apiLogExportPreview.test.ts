import { describe, expect, it } from 'vitest';
import type { ApiLogEntry, Workspace } from '../../shared/contracts';
import {
  apiLogExportPreviewContentMaxChars,
  apiLogExportPreviewSampleLimit,
  createPreparedApiLogExportPreview,
  isApiLogExportDiscardRequest,
  isApiLogExportSaveRequest
} from '../../shared/domain/apiLogExportPreview';

const workspace: Workspace = {
  id: 'workspace-1',
  name: 'Development',
  environmentType: 'dev',
  prodDomains: [],
  partitionKey: 'persist:workspace-1',
  tabs: [],
  createdAt: '2026-07-24T00:00:00.000Z',
  updatedAt: '2026-07-24T00:00:00.000Z'
};

const createSafeLog = (overrides: Partial<ApiLogEntry> = {}): ApiLogEntry => ({
  id: 'log-1',
  workspaceId: workspace.id,
  tabId: 'tab-1',
  type: 'fetch',
  method: 'POST',
  url: 'https://alice:basic-secret@example.com/api/users?name=Mizzz&access_token=oauth-secret&signature=signed#fragment-secret',
  status: 201,
  durationMs: 120,
  requestHeaders: {
    authorization: 'Bearer request-secret',
    'x-session-id': 'session-secret',
    location: 'https://example.com/request?token=request-location-secret',
    accept: 'application/json'
  },
  requestBody: {
    kind: 'json',
    contentType: 'application/json',
    content: '{"password":"<redacted>","profile":{"apiKey":"<redacted>"}}',
    byteLength: 72,
    isTruncated: false,
    redactedFieldPaths: ['password', 'profile.apiKey']
  },
  responseHeaders: {
    'set-cookie': 'session=response-secret',
    refresh: '0;url=https://example.com?token=refresh-secret',
    location: 'https://example.com/response?signature=response-location-secret'
  },
  responseBody: {
    kind: 'json',
    contentType: 'application/json',
    content: '{"refreshToken":"<redacted>"}',
    byteLength: 38,
    isTruncated: false,
    redactedFieldPaths: ['refreshToken']
  },
  startedAt: 100,
  finishedAt: 220,
  ...overrides
});

const unavailableLog: ApiLogEntry = createSafeLog({
  id: 'log-2',
  type: 'xhr',
  url: 'not a valid url',
  status: undefined,
  requestHeaders: { cookie: 'session=raw-cookie' },
  responseHeaders: {},
  requestBody: {
    kind: 'unavailable',
    contentType: 'multipart/form-data',
    byteLength: 1024,
    isTruncated: false,
    redactedFieldPaths: [],
    unavailableReason: 'unsupported-content-type'
  },
  responseBody: {
    kind: 'unavailable',
    contentType: 'text/html',
    byteLength: 2048,
    isTruncated: false,
    redactedFieldPaths: [],
    unavailableReason: 'unsupported-content-type'
  },
  responseBodySnippet: 'net::ERR_FAILED raw-secret',
  startedAt: 300,
  finishedAt: 400
});

describe('APIログエクスポートプレビュー', () => {
  it('実際の出力対象ログからマスキング件数と取得不可件数を集計する', () => {
    const prepared = createPreparedApiLogExportPreview({
      workspace,
      logs: [createSafeLog(), unavailableLog],
      format: 'json',
      filterKind: 'all',
      exportedAt: 1_000
    });

    expect(prepared.maskingReport).toEqual({
      urlUserInfoRemoved: 1,
      invalidUrlsRedacted: 1,
      urlFragmentsRedacted: 1,
      sensitiveQueryValuesRedacted: 2,
      requestHeaderValuesRedacted: 3,
      responseHeaderValuesRedacted: 2,
      requestUrlHeaderValuesSanitized: 1,
      responseUrlHeaderValuesSanitized: 1,
      requestBodyFieldsRedacted: 2,
      responseBodyFieldsRedacted: 1,
      requestBodiesUnavailable: 1,
      responseBodiesUnavailable: 1,
      networkErrorStringsExcluded: 1
    });
  });

  it('通信サンプルには安全化済みURLとbody状態だけを含める', () => {
    const prepared = createPreparedApiLogExportPreview({
      workspace,
      logs: [createSafeLog(), unavailableLog],
      format: 'har',
      filterKind: 'all',
      exportedAt: 1_000
    });

    expect(prepared.sampleEntries[0]).toMatchObject({
      method: 'POST',
      status: 201,
      requestBodyState: 'included',
      responseBodyState: 'included',
      requestBodyFieldsRedacted: 2,
      responseBodyFieldsRedacted: 1
    });
    expect(prepared.sampleEntries[1]).toMatchObject({
      requestBodyState: 'unavailable',
      responseBodyState: 'unavailable'
    });

    const serialized = JSON.stringify(prepared.sampleEntries);
    expect(serialized).not.toContain('basic-secret');
    expect(serialized).not.toContain('oauth-secret');
    expect(serialized).not.toContain('signed');
    expect(serialized).not.toContain('raw-secret');
    expect(serialized).toContain('%3Credacted%3E');
  });

  it('サンプルを10件に制限し、成果物プレビューを12,000文字へ切り詰められる', () => {
    const logs = Array.from({ length: 20 }, (_, index) =>
      createSafeLog({
        id: `log-${index}`,
        url: `https://example.com/api/items/${index}?token=secret-${index}`,
        responseBody: {
          kind: 'json',
          contentType: 'application/json',
          content: JSON.stringify({ index, value: 'x'.repeat(1_000) }),
          byteLength: 1_100,
          isTruncated: false,
          redactedFieldPaths: []
        }
      })
    );
    const prepared = createPreparedApiLogExportPreview({
      workspace,
      logs,
      format: 'json',
      filterKind: 'all',
      exportedAt: 1_000
    });
    const contentPreview = prepared.artifact.content.slice(0, apiLogExportPreviewContentMaxChars);

    expect(prepared.sampleEntries).toHaveLength(apiLogExportPreviewSampleLimit);
    expect(prepared.artifact.content.length).toBeGreaterThan(apiLogExportPreviewContentMaxChars);
    expect(contentPreview).toHaveLength(apiLogExportPreviewContentMaxChars);
    expect(contentPreview).not.toContain('secret-0');
  });

  it('フィルター後のログだけを集計対象にする', () => {
    const prepared = createPreparedApiLogExportPreview({
      workspace,
      logs: [createSafeLog(), unavailableLog],
      format: 'json',
      filterKind: 'xhr',
      exportedAt: 1_000
    });

    expect(prepared.artifact.exportedCount).toBe(1);
    expect(prepared.sampleEntries).toHaveLength(1);
    expect(prepared.maskingReport.invalidUrlsRedacted).toBe(1);
    expect(prepared.maskingReport.urlUserInfoRemoved).toBe(0);
  });

  it('保存・破棄IPCへ渡すpreview IDをruntime validationする', () => {
    const valid = { previewId: '123e4567-e89b-12d3-a456-426614174000' };

    expect(isApiLogExportSaveRequest(valid)).toBe(true);
    expect(isApiLogExportDiscardRequest(valid)).toBe(true);
    expect(isApiLogExportSaveRequest({ previewId: '' })).toBe(false);
    expect(isApiLogExportSaveRequest({ previewId: 'not-a-uuid' })).toBe(false);
    expect(isApiLogExportDiscardRequest({ previewId: 123 })).toBe(false);
  });
});
