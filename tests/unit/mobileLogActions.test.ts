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
    'content-type': 'application/json',
    authorization: 'Bearer secret-token',
    Cookie: 'session=secret-cookie',
    'content-length': '128',
    host: 'example.com',
    'x-api-key': 'secret-key'
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
    'content-type': 'application/json'
  },
  responseBody: {
    kind: 'json',
    contentType: 'application/json',
    content: '{"id":1,"name":"Mizzz","access_token":"<redacted>"}',
    byteLength: 72,
    isTruncated: false,
    redactedFieldPaths: ['access_token']
  },
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

  it('cURLで機密ヘッダーを伏字にし、安全化済みRequest bodyを含める', () => {
    const curl = buildRedactedCurlCommand(log);

    expect(curl).toContain('curl --request POST');
    expect(curl).toContain("--header 'accept: application/json'");
    expect(curl).toContain("--header 'authorization: <redacted>'");
    expect(curl).toContain("--header 'Cookie: <redacted>'");
    expect(curl).toContain("--header 'x-api-key: <redacted>'");
    expect(curl).toContain("--data-raw '{\"name\":\"Mizzz\",\"password\":\"<redacted>\"}'");
    expect(curl).not.toContain('secret-token');
    expect(curl).not.toContain('secret-cookie');
    expect(curl).not.toContain('secret-key');
    expect(curl).not.toContain('content-length');
    expect(curl).not.toContain("--header 'host:");
    expect(curl).toContain("'https://example.com/api/users?name=O'\\''Reilly'");
  });

  it('取得不可または切り詰めbodyをcURLへ含めない', () => {
    const unavailable = buildRedactedCurlCommand({
      ...log,
      requestBody: {
        kind: 'unavailable',
        contentType: 'application/json',
        byteLength: 20_000,
        isTruncated: true,
        redactedFieldPaths: [],
        unavailableReason: 'body-too-large'
      }
    });

    expect(unavailable).not.toContain('--data-raw');
  });

  it('安全化済みResponse bodyだけをJSONコピー対象にする', () => {
    const artifacts = createMobileLogActionArtifacts(log);
    const unavailable = createMobileLogActionArtifacts({
      ...log,
      responseBody: {
        kind: 'unavailable',
        contentType: 'application/json',
        byteLength: 70_000,
        isTruncated: true,
        redactedFieldPaths: [],
        unavailableReason: 'body-too-large'
      }
    });

    expect(artifacts.json).toContain('"access_token": "<redacted>"');
    expect(artifacts.json).not.toContain('secret-response-token');
    expect(unavailable.json).toBeUndefined();
  });

  it('共有サマリーに通信情報と安全化状況を含める', () => {
    const artifacts = createMobileLogActionArtifacts(log);

    expect(artifacts.url).toBe(log.url);
    expect(artifacts.redactedHeaderNames).toEqual(['authorization', 'Cookie', 'x-api-key']);
    expect(artifacts.redactedRequestBodyFieldPaths).toEqual(['password']);
    expect(artifacts.redactedResponseBodyFieldPaths).toEqual(['access_token']);
    expect(artifacts.requestBodyIncluded).toBe(true);
    expect(artifacts.summary).toContain('POST 201 · 184ms');
    expect(artifacts.summary).toContain('cURL（機密ヘッダー・Request body項目は伏字）');
    expect(artifacts.summary).toContain('伏字項目: password');
    expect(artifacts.summary).toContain('マスキング項目: access_token');
    expect(artifacts.summary).not.toContain('secret-token');
  });
});
