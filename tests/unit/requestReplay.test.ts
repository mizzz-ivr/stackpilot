import { describe, expect, it } from 'vitest';
import {
  evaluateRequestReplayEligibility,
  isRequestReplayRequest
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

describe('Request Replay IPC request validation', () => {
  it('Workspace IDとlog IDがあるrequestだけを受け付ける', () => {
    expect(isRequestReplayRequest({ workspaceId: 'workspace-1', logId: 'log-1' })).toBe(true);
    expect(isRequestReplayRequest({ workspaceId: '', logId: 'log-1' })).toBe(false);
    expect(isRequestReplayRequest({ workspaceId: 'workspace-1', logId: '' })).toBe(false);
    expect(isRequestReplayRequest({ workspaceId: 'workspace-1', logId: 1 })).toBe(false);
    expect(isRequestReplayRequest(null)).toBe(false);
  });
});
