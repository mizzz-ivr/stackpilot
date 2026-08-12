import { describe, expect, it } from 'vitest';
import {
  createRequestReplayTargetUrl,
  evaluateRequestReplayEligibility,
  isRequestReplayRequest,
  parseRequestReplayQueryEntries,
  requestReplayQueryLimits,
  validateRequestReplayQueryEntries
} from '../../shared/domain/requestReplay';

describe('Request Replay対象判定', () => {
  it('GET / HEADのHTTP(S)通信を許可する', () => {
    expect(evaluateRequestReplayEligibility({
      method: 'get',
      url: 'https://api.example.test/users?trace=1'
    })).toEqual({ replayable: true, method: 'GET' });

    expect(evaluateRequestReplayEligibility({
      method: 'HEAD',
      url: 'http://localhost:3000/health'
    })).toEqual({ replayable: true, method: 'HEAD' });
  });

  it('POST等の非対応methodを拒否する', () => {
    const result = evaluateRequestReplayEligibility({
      method: 'POST',
      url: 'https://api.example.test/users'
    });

    expect(result.replayable).toBe(false);
    expect(result.reasonCode).toBe('unsupported-method');
  });

  it('Request bodyを持つGETを拒否する', () => {
    const result = evaluateRequestReplayEligibility({
      method: 'GET',
      url: 'https://api.example.test/search',
      requestBody: { byteLength: 12 }
    });

    expect(result.replayable).toBe(false);
    expect(result.reasonCode).toBe('request-body-present');
  });

  it('HTTP(S)以外と不正URLを拒否する', () => {
    expect(evaluateRequestReplayEligibility({
      method: 'GET',
      url: 'file:///tmp/test.json'
    }).reasonCode).toBe('unsupported-url-scheme');

    expect(evaluateRequestReplayEligibility({
      method: 'GET',
      url: 'not a url'
    }).reasonCode).toBe('invalid-url');
  });

  it('URL credentialsを含む通信を拒否する', () => {
    const result = evaluateRequestReplayEligibility({
      method: 'GET',
      url: 'https://user:password@api.example.test/private'
    });

    expect(result.replayable).toBe(false);
    expect(result.reasonCode).toBe('url-credentials-present');
  });
});

describe('Request Replay query編集', () => {
  it('重複queryと空値を順序どおりparseする', () => {
    expect(parseRequestReplayQueryEntries(
      'https://api.example.test/items?tag=a&tag=b&flag='
    )).toEqual([
      { name: 'tag', value: 'a' },
      { name: 'tag', value: 'b' },
      { name: 'flag', value: '' }
    ]);
  });

  it('originとpathを元URLから固定してqueryだけを再構築しfragmentを除去する', () => {
    expect(createRequestReplayTargetUrl(
      'https://api.example.test:8443/items/list?old=1#secret',
      [
        { name: 'tag', value: 'A B' },
        { name: 'tag', value: '日本' },
        { name: 'flag', value: '' }
      ]
    )).toBe(
      'https://api.example.test:8443/items/list?tag=A+B&tag=%E6%97%A5%E6%9C%AC&flag='
    );
  });

  it('query指定を省略した場合は元queryを保持してfragmentだけ除去する', () => {
    expect(createRequestReplayTargetUrl(
      'https://api.example.test/items?page=2#section'
    )).toBe('https://api.example.test/items?page=2');
  });

  it('空query名・制御文字・個別上限を拒否する', () => {
    expect(validateRequestReplayQueryEntries([{ name: '', value: '' }])).toMatchObject({ valid: false });
    expect(validateRequestReplayQueryEntries([{ name: 'trace\n', value: '1' }])).toMatchObject({ valid: false });
    expect(validateRequestReplayQueryEntries([{
      name: 'a'.repeat(requestReplayQueryLimits.maxNameLength + 1),
      value: '1'
    }])).toMatchObject({ valid: false });
    expect(validateRequestReplayQueryEntries([{
      name: 'trace',
      value: 'a'.repeat(requestReplayQueryLimits.maxValueLength + 1)
    }])).toMatchObject({ valid: false });
  });

  it('件数上限とエンコード後query全体上限を拒否する', () => {
    const tooMany = Array.from(
      { length: requestReplayQueryLimits.maxEntries + 1 },
      (_, index) => ({ name: `p${index}`, value: '1' })
    );
    expect(validateRequestReplayQueryEntries(tooMany)).toMatchObject({ valid: false });

    const tooLong = Array.from(
      { length: 4 },
      (_, index) => ({ name: `p${index}`, value: 'a'.repeat(requestReplayQueryLimits.maxValueLength) })
    );
    expect(validateRequestReplayQueryEntries(tooLong)).toMatchObject({ valid: false });
  });

  it('重複queryと空値を含む有効なentriesを許可する', () => {
    expect(validateRequestReplayQueryEntries([
      { name: 'tag', value: 'a' },
      { name: 'tag', value: 'b' },
      { name: 'flag', value: '' }
    ])).toEqual({ valid: true });
  });
});

describe('Request Replay IPC request validation', () => {
  it('Workspace IDとlog IDに加え、query entriesの構造を検証する', () => {
    expect(isRequestReplayRequest({ workspaceId: 'workspace-1', logId: 'log-1' })).toBe(true);
    expect(isRequestReplayRequest({
      workspaceId: 'workspace-1',
      logId: 'log-1',
      queryEntries: [{ name: 'page', value: '2' }]
    })).toBe(true);
    expect(isRequestReplayRequest({
      workspaceId: 'workspace-1',
      logId: 'log-1',
      queryEntries: [{ name: 'page', value: 2 }]
    })).toBe(false);
    expect(isRequestReplayRequest({ workspaceId: '', logId: 'log-1' })).toBe(false);
    expect(isRequestReplayRequest({ workspaceId: 'workspace-1', logId: '' })).toBe(false);
    expect(isRequestReplayRequest({ workspaceId: 'workspace-1', logId: 1 })).toBe(false);
    expect(isRequestReplayRequest(null)).toBe(false);
  });
});
