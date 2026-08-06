import { describe, expect, it } from 'vitest';
import type { ApiLogEntry, Workspace } from '../../shared/contracts';
import {
  apiLogComparisonExportSchema,
  createSafeApiLogComparisonArtifact,
  isApiLogComparisonExportRequest
} from '../../shared/domain/apiLogComparisonExport';

const workspace: Workspace = {
  id: 'workspace-1',
  name: 'Comparison Workspace',
  environmentType: 'dev',
  prodDomains: [],
  partitionKey: 'persist:workspace-1',
  tabs: [],
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z'
};

const createEntry = (overrides: Partial<ApiLogEntry> = {}): ApiLogEntry => ({
  id: 'log-left',
  workspaceId: workspace.id,
  tabId: 'tab-1',
  type: 'xhr',
  method: 'GET',
  url: 'https://user:password@api.example.test/users/1?token=secret&trace=public#details',
  status: 200,
  durationMs: 80,
  requestHeaders: {
    Accept: 'application/json',
    Authorization: 'Bearer secret-token'
  },
  requestBody: {
    kind: 'json',
    contentType: 'application/json',
    content: '{"name":"alice","token":"<redacted>"}',
    byteLength: 42,
    isTruncated: false,
    redactedFieldPaths: ['token']
  },
  responseHeaders: {
    'content-type': 'application/json',
    location: 'https://user:password@api.example.test/users/1?token=secret#result'
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
  finishedAt: 1_080,
  updatedAt: 1_080,
  ...overrides
});

describe('API通信比較保存request', () => {
  it('異なる2件のログIDとbooleanだけを受け付ける', () => {
    expect(isApiLogComparisonExportRequest({
      workspaceId: 'workspace-1',
      leftLogId: 'log-left',
      rightLogId: 'log-right',
      differencesOnly: true
    })).toBe(true);
    expect(isApiLogComparisonExportRequest({
      workspaceId: 'workspace-1',
      leftLogId: 'same',
      rightLogId: 'same',
      differencesOnly: true
    })).toBe(false);
    expect(isApiLogComparisonExportRequest({
      workspaceId: 'workspace-1',
      leftLogId: 'log-left',
      rightLogId: 'log-right',
      differencesOnly: 'true'
    })).toBe(false);
  });
});

describe('安全化済みAPI通信比較artifact', () => {
  it('URL・headerを再サニタイズし、通信エラー詳細を含めない', () => {
    const artifact = createSafeApiLogComparisonArtifact({
      workspace,
      left: createEntry(),
      right: createEntry({
        id: 'log-right',
        method: 'POST',
        status: undefined,
        responseBody: undefined,
        responseBodySnippet: 'net::ERR_CONNECTION_REFUSED internal-host.local'
      }),
      differencesOnly: false,
      exportedAt: 1_700_000_000_000
    });
    const parsed = JSON.parse(artifact.content);

    expect(parsed.schema).toBe(apiLogComparisonExportSchema);
    expect(parsed.version).toBe(1);
    expect(parsed.security.sanitized).toBe(true);
    expect(parsed.targets.left.url).not.toContain('user:password');
    expect(parsed.targets.left.url).toContain('token=%3Credacted%3E');
    expect(parsed.targets.left.url).toContain('#redacted');
    expect(parsed.comparison.requestHeaders.find((row: { name: string }) => row.name === 'authorization')).toMatchObject({
      left: '<redacted>',
      right: '<redacted>'
    });
    expect(artifact.content).not.toContain('secret-token');
    expect(artifact.content).not.toContain('ERR_CONNECTION_REFUSED');
    expect(artifact.content).not.toContain('internal-host.local');
    expect(parsed.targets.right.networkError).toBe('request-failed');
  });

  it('差分のみでは同一項目と同一bodyを成果物から除外する', () => {
    const artifact = createSafeApiLogComparisonArtifact({
      workspace,
      left: createEntry(),
      right: createEntry({
        id: 'log-right',
        status: 503,
        requestHeaders: {
          Accept: 'application/json',
          Authorization: 'Bearer another-secret'
        }
      }),
      differencesOnly: true,
      exportedAt: 1_700_000_000_000
    });
    const parsed = JSON.parse(artifact.content);

    expect(parsed.options.differencesOnly).toBe(true);
    expect(parsed.counts.visible).toBe(parsed.counts.different);
    expect(parsed.comparison.summary.every((row: { difference: string }) => row.difference !== 'same')).toBe(true);
    expect(parsed.comparison.requestHeaders).toEqual([]);
    expect(parsed.comparison.requestBody).toBeUndefined();
    expect(parsed.comparison.responseBody).toBeUndefined();
    expect(artifact.exportedItemCount).toBe(artifact.differenceCount);
  });

  it('別Workspaceまたは同一IDの比較を拒否する', () => {
    expect(() => createSafeApiLogComparisonArtifact({
      workspace,
      left: createEntry(),
      right: createEntry({ id: 'log-right', workspaceId: 'workspace-2' }),
      differencesOnly: false
    })).toThrow('comparison-target-mismatch');
    expect(() => createSafeApiLogComparisonArtifact({
      workspace,
      left: createEntry(),
      right: createEntry(),
      differencesOnly: false
    })).toThrow('comparison-target-mismatch');
  });
});
