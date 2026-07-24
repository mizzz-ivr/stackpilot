import { describe, expect, it } from 'vitest';
import type { ApiLogEntry, Workspace } from '../../shared/contracts';
import {
  createSafeApiLogExport,
  isApiLogExportRequest,
  sanitizeExportHeaders,
  sanitizeExportUrl
} from '../../shared/domain/apiLogExport';

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

const createLog = (overrides: Partial<ApiLogEntry> = {}): ApiLogEntry => ({
  id: 'log-1',
  workspaceId: workspace.id,
  tabId: 'tab-1',
  type: 'fetch',
  method: 'POST',
  url: 'https://alice:basic-password@example.com/api/users?name=Mizzz&access_token=oauth-secret#session-fragment',
  status: 201,
  durationMs: 184,
  requestHeaders: {
    accept: 'application/json',
    authorization: 'Bearer secret-token',
    Cookie: 'session=secret-cookie',
    'x-api-key': 'secret-api-key'
  },
  requestBody: {
    kind: 'json',
    contentType: 'application/json',
    content: '{"name":"Mizzz","password":"<redacted>"}',
    byteLength: 52,
    isTruncated: false,
    redactedFieldPaths: ['password']
  },
  responseHeaders: {
    'content-type': 'application/json',
    'set-cookie': 'session=server-secret',
    location: 'https://example.com/callback?signature=redirect-secret'
  },
  responseBody: {
    kind: 'json',
    contentType: 'application/json',
    content: '{"id":1,"refreshToken":"<redacted>"}',
    byteLength: 48,
    isTruncated: false,
    redactedFieldPaths: ['refreshToken']
  },
  responseBodySnippet: 'raw-error-with-secret-value',
  startedAt: Date.UTC(2026, 6, 24, 1, 2, 3),
  finishedAt: Date.UTC(2026, 6, 24, 1, 2, 3, 184),
  updatedAt: Date.UTC(2026, 6, 24, 1, 2, 3, 200),
  ...overrides
});

describe('APIログの安全化済みエクスポート', () => {
  it('URLのuserinfo・fragment・機密クエリ値を除去または伏字化する', () => {
    const sanitized = sanitizeExportUrl(
      'https://alice:password@example.com/path?name=Mizzz&access_token=secret&signature=signed#token-fragment'
    );

    expect(sanitized).toContain('https://example.com/path');
    expect(sanitized).toContain('name=Mizzz');
    expect(sanitized).toContain('access_token=%3Credacted%3E');
    expect(sanitized).toContain('signature=%3Credacted%3E');
    expect(sanitized).toContain('#redacted');
    expect(sanitized).not.toContain('alice');
    expect(sanitized).not.toContain('password');
    expect(sanitized).not.toContain('secret');
    expect(sanitized).not.toContain('signed');
    expect(sanitizeExportUrl('not a valid url')).toBe('<redacted-invalid-url>');
  });

  it('機密ヘッダーを伏字化し、URL値を再サニタイズする', () => {
    const headers = sanitizeExportHeaders({
      Authorization: 'Bearer secret',
      Cookie: 'session=secret',
      'Set-Cookie': 'session=server-secret',
      'X-Session-ID': 'custom-session-secret',
      'X-Private-Key': 'custom-private-key',
      Location: 'https://example.com/callback?token=redirect-secret',
      Refresh: '0;url=https://example.com?token=secret',
      Accept: 'application/json'
    });

    expect(headers.Authorization).toBe('<redacted>');
    expect(headers.Cookie).toBe('<redacted>');
    expect(headers['Set-Cookie']).toBe('<redacted>');
    expect(headers['X-Session-ID']).toBe('<redacted>');
    expect(headers['X-Private-Key']).toBe('<redacted>');
    expect(headers.Location).toContain('token=%3Credacted%3E');
    expect(headers.Refresh).toBe('<redacted>');
    expect(headers.Accept).toBe('application/json');
    expect(JSON.stringify(headers)).not.toContain('redirect-secret');
    expect(JSON.stringify(headers)).not.toContain('server-secret');
    expect(JSON.stringify(headers)).not.toContain('custom-session-secret');
    expect(JSON.stringify(headers)).not.toContain('custom-private-key');
  });

  it('Stackpilot Safe JSONへ安全化済みデータだけを出力する', () => {
    const artifact = createSafeApiLogExport({
      workspace,
      logs: [createLog()],
      format: 'json',
      filterKind: 'all',
      exportedAt: Date.UTC(2026, 6, 24, 2, 0, 0)
    });
    const payload = JSON.parse(artifact.content) as {
      schema: string;
      counts: { exported: number; omitted: number };
      security: { sanitized: boolean; rawBodiesIncluded: boolean };
      logs: Array<{
        url: string;
        requestHeaders: Record<string, string>;
        requestBody: { content: string };
        responseHeaders: Record<string, string>;
        responseBody: { content: string };
        responseBodySnippet?: string;
      }>;
    };

    expect(payload.schema).toBe('stackpilot-safe-log-export');
    expect(payload.counts).toEqual({ exported: 1, omitted: 0 });
    expect(payload.security).toMatchObject({ sanitized: true, rawBodiesIncluded: false });
    expect(payload.logs[0].requestHeaders.authorization).toBe('<redacted>');
    expect(payload.logs[0].responseHeaders['set-cookie']).toBe('<redacted>');
    expect(payload.logs[0].requestBody.content).toContain('<redacted>');
    expect(payload.logs[0].responseBody.content).toContain('<redacted>');
    expect(payload.logs[0].responseBodySnippet).toBeUndefined();

    expect(artifact.content).not.toContain('basic-password');
    expect(artifact.content).not.toContain('oauth-secret');
    expect(artifact.content).not.toContain('secret-token');
    expect(artifact.content).not.toContain('secret-cookie');
    expect(artifact.content).not.toContain('secret-api-key');
    expect(artifact.content).not.toContain('server-secret');
    expect(artifact.content).not.toContain('redirect-secret');
    expect(artifact.content).not.toContain('raw-error-with-secret-value');
  });

  it('HAR 1.2互換形式でcookiesを展開せず、安全化済みbodyだけを含める', () => {
    const artifact = createSafeApiLogExport({
      workspace,
      logs: [createLog()],
      format: 'har',
      filterKind: 'fetch',
      exportedAt: Date.UTC(2026, 6, 24, 2, 0, 0)
    });
    const payload = JSON.parse(artifact.content) as {
      log: {
        version: string;
        entries: Array<{
          request: {
            cookies: unknown[];
            queryString: Array<{ name: string; value: string }>;
            postData?: { text: string };
          };
          response: {
            cookies: unknown[];
            content: { text?: string };
          };
        }>;
        _stackpilot: { sanitized: boolean };
      };
    };
    const entry = payload.log.entries[0];

    expect(payload.log.version).toBe('1.2');
    expect(payload.log._stackpilot.sanitized).toBe(true);
    expect(entry.request.cookies).toEqual([]);
    expect(entry.response.cookies).toEqual([]);
    expect(entry.request.queryString).toContainEqual({ name: 'access_token', value: '<redacted>' });
    expect(entry.request.postData?.text).toContain('<redacted>');
    expect(entry.response.content.text).toContain('<redacted>');
    expect(artifact.content).not.toContain('oauth-secret');
    expect(artifact.content).not.toContain('secret-token');
    expect(artifact.content).not.toContain('secret-cookie');
  });

  it('フィルターを反映し、最大500件を超えた分を省略する', () => {
    const logs = Array.from({ length: 502 }, (_, index) =>
      createLog({
        id: `xhr-${index}`,
        type: 'xhr',
        startedAt: index
      })
    );
    logs.push(createLog({ id: 'fetch-only', type: 'fetch' }));

    const xhrArtifact = createSafeApiLogExport({
      workspace,
      logs,
      format: 'json',
      filterKind: 'xhr'
    });
    const fetchArtifact = createSafeApiLogExport({
      workspace,
      logs,
      format: 'json',
      filterKind: 'fetch'
    });

    expect(xhrArtifact.exportedCount).toBe(500);
    expect(xhrArtifact.omittedCount).toBe(2);
    expect(fetchArtifact.exportedCount).toBe(1);
    expect(fetchArtifact.omittedCount).toBe(0);
  });

  it('IPCへ渡すエクスポート条件をruntime validationする', () => {
    expect(isApiLogExportRequest({ workspaceId: 'workspace-1', format: 'json', filterKind: 'all' })).toBe(true);
    expect(isApiLogExportRequest({ workspaceId: 'workspace-1', format: 'har', filterKind: 'fetch' })).toBe(true);
    expect(isApiLogExportRequest({ workspaceId: '', format: 'json', filterKind: 'all' })).toBe(false);
    expect(isApiLogExportRequest({ workspaceId: 'workspace-1', format: 'csv', filterKind: 'all' })).toBe(false);
    expect(isApiLogExportRequest({ workspaceId: 'workspace-1', format: 'json', filterKind: 'post' })).toBe(false);
  });
});
