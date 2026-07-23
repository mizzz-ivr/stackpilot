import { describe, expect, it } from 'vitest';
import {
  createSafeRequestBodyPreview,
  isSensitiveRequestBodyFieldName,
  isSupportedRequestBodyContentType,
  maxCapturedRequestBodyBytes
} from '../../shared/domain/requestBody';

describe('safe request body', () => {
  it('JSONとform-urlencodedだけを対象にする', () => {
    expect(isSupportedRequestBodyContentType('application/json; charset=utf-8')).toBe(true);
    expect(isSupportedRequestBodyContentType('application/problem+json')).toBe(true);
    expect(isSupportedRequestBodyContentType('application/x-www-form-urlencoded')).toBe(true);
    expect(isSupportedRequestBodyContentType('multipart/form-data; boundary=test')).toBe(false);
    expect(isSupportedRequestBodyContentType('text/plain')).toBe(false);
  });

  it('キー表記の差異を正規化して機密項目を判定する', () => {
    expect(isSensitiveRequestBodyFieldName('password')).toBe(true);
    expect(isSensitiveRequestBodyFieldName('user_password')).toBe(true);
    expect(isSensitiveRequestBodyFieldName('client-secret')).toBe(true);
    expect(isSensitiveRequestBodyFieldName('refreshToken')).toBe(true);
    expect(isSensitiveRequestBodyFieldName('displayName')).toBe(false);
  });

  it('ネストしたJSONの機密値を再帰的に伏字化する', () => {
    const preview = createSafeRequestBodyPreview({
      contentType: 'application/json',
      rawBody: JSON.stringify({
        email: 'user@example.com',
        password: 'raw-password',
        credentials: { access_token: 'raw-token' },
        items: [{ clientSecret: 'raw-secret', name: 'safe' }]
      }),
      byteLength: 180
    });

    expect(preview).toMatchObject({
      kind: 'json',
      isTruncated: false,
      redactedFieldPaths: ['credentials.access_token', 'items[0].clientSecret', 'password']
    });
    expect(preview?.content).toContain('"email":"user@example.com"');
    expect(preview?.content).toContain('"password":"<redacted>"');
    expect(preview?.content).not.toContain('raw-password');
    expect(preview?.content).not.toContain('raw-token');
    expect(preview?.content).not.toContain('raw-secret');
  });

  it('form-urlencodedの機密項目を伏字化する', () => {
    const preview = createSafeRequestBodyPreview({
      contentType: 'application/x-www-form-urlencoded',
      rawBody: 'email=user%40example.com&password=raw-password&csrf_token=raw-csrf',
      byteLength: 74
    });

    expect(preview).toMatchObject({
      kind: 'form',
      redactedFieldPaths: ['csrf_token', 'password']
    });
    expect(preview?.content).toContain('email=user%40example.com');
    expect(preview?.content).toContain('password=%3Credacted%3E');
    expect(preview?.content).not.toContain('raw-password');
    expect(preview?.content).not.toContain('raw-csrf');
  });

  it('16KiB超過時は本文を保持しない', () => {
    const preview = createSafeRequestBodyPreview({
      contentType: 'application/json',
      rawBody: '{"password":"should-not-remain"}',
      byteLength: maxCapturedRequestBodyBytes + 1,
      tooLarge: true
    });

    expect(preview).toMatchObject({
      kind: 'unavailable',
      unavailableReason: 'body-too-large',
      isTruncated: true
    });
    expect(preview?.content).toBeUndefined();
  });

  it('対象外Content-Type・不正JSON・blob uploadは本文を公開しない', () => {
    expect(
      createSafeRequestBodyPreview({
        contentType: 'text/plain',
        rawBody: 'password=raw',
        byteLength: 12
      })
    ).toMatchObject({ kind: 'unavailable', unavailableReason: 'unsupported-content-type' });

    expect(
      createSafeRequestBodyPreview({
        contentType: 'application/json',
        rawBody: '{invalid',
        byteLength: 8
      })
    ).toMatchObject({ kind: 'unavailable', unavailableReason: 'invalid-json' });

    expect(
      createSafeRequestBodyPreview({
        contentType: 'application/json',
        byteLength: 0,
        unsupportedUpload: true
      })
    ).toMatchObject({ kind: 'unavailable', unavailableReason: 'unsupported-upload-data' });
  });
});
