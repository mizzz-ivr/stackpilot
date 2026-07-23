import { describe, expect, it } from 'vitest';
import {
  buildRedactedCurlCommand,
  createCopyableJson,
  createMobileLogActionArtifacts,
  isSensitiveHeaderName
} from '../../shared/domain/mobileLogActions';
import type { NetworkLog } from '../../shared/domain/inspector';

const log: NetworkLog = {
  id: 'log-1',
  workspaceId: 'workspace-1',
  tabId: 'tab-1',
  resourceType: 'fetch',
  method: 'post',
  url: "https://example.com/api/users?name=O'Reilly",
  status: 201,
  durationMs: 184,
  requestHeaders: {
    accept: 'application/json',
    authorization: 'Bearer secret-token',
    Cookie: 'session=secret-cookie',
    'content-length': '128',
    host: 'example.com',
    'x-api-key': 'secret-key'
  },
  responseHeaders: {
    'content-type': 'application/json'
  },
  responseBodySnippet: '{"id":1,"name":"Mizzz"}',
  startedAt: Date.UTC(2026, 6, 23, 1, 2, 3),
  finishedAt: Date.UTC(2026, 6, 23, 1, 2, 3, 184)
};

describe('mobile log actions', () => {
  it('機密ヘッダー名を大文字小文字に依存せず判定する', () => {
    expect(isSensitiveHeaderName('Authorization')).toBe(true);
    expect(isSensitiveHeaderName(' cookie ')).toBe(true);
    expect(isSensitiveHeaderName('X-CSRF-Token')).toBe(true);
    expect(isSensitiveHeaderName('content-type')).toBe(false);
  });

  it('JSONレスポンスを整形する', () => {
    expect(createCopyableJson('{"ok":true,"items":[1,2]}')).toBe(
      '{\n  "ok": true,\n  "items": [\n    1,\n    2\n  ]\n}'
    );
    expect(createCopyableJson('plain text')).toBeUndefined();
    expect(createCopyableJson()).toBeUndefined();
  });

  it('cURLで機密ヘッダーを伏字にし、再現に不要なヘッダーを除外する', () => {
    const curl = buildRedactedCurlCommand(log);

    expect(curl).toContain('curl --request POST');
    expect(curl).toContain("--header 'accept: application/json'");
    expect(curl).toContain("--header 'authorization: <redacted>'");
    expect(curl).toContain("--header 'Cookie: <redacted>'");
    expect(curl).toContain("--header 'x-api-key: <redacted>'");
    expect(curl).not.toContain('secret-token');
    expect(curl).not.toContain('secret-cookie');
    expect(curl).not.toContain('secret-key');
    expect(curl).not.toContain('content-length');
    expect(curl).not.toContain("--header 'host:");
    expect(curl).toContain("'https://example.com/api/users?name=O'\\''Reilly'");
  });

  it('共有サマリーに通信情報と安全なcURLを含める', () => {
    const artifacts = createMobileLogActionArtifacts(log);

    expect(artifacts.url).toBe(log.url);
    expect(artifacts.json).toContain('"name": "Mizzz"');
    expect(artifacts.redactedHeaderNames).toEqual(['authorization', 'Cookie', 'x-api-key']);
    expect(artifacts.requestBodyIncluded).toBe(false);
    expect(artifacts.summary).toContain('POST 201 · 184ms');
    expect(artifacts.summary).toContain('cURL（機密ヘッダーは伏字）');
    expect(artifacts.summary).toContain('Request bodyが含まれていません');
    expect(artifacts.summary).not.toContain('secret-token');
  });
});
