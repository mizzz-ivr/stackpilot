import type { MobileInspectorSnapshot } from '@stackpilot/shared/domain/mobile-inspector';

const now = Date.now();

export const demoInspectorSnapshot: MobileInspectorSnapshot = {
  workspace: {
    id: 'demo-workspace',
    name: 'Storefront staging',
    environmentType: 'stg'
  },
  capturedAt: now,
  logs: [
    {
      id: 'log-users',
      workspaceId: 'demo-workspace',
      tabId: 'demo-tab',
      resourceType: 'fetch',
      method: 'GET',
      url: 'https://stg.example.com/api/users?page=1',
      status: 200,
      durationMs: 184,
      requestHeaders: {
        accept: 'application/json',
        'x-stackpilot-environment': 'stg'
      },
      responseHeaders: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      },
      responseBodySnippet: JSON.stringify({ users: [{ id: 1, name: 'Mizzz' }], nextPage: 2 }),
      startedAt: now - 15_000,
      finishedAt: now - 14_816
    },
    {
      id: 'log-order',
      workspaceId: 'demo-workspace',
      tabId: 'demo-tab',
      resourceType: 'xhr',
      method: 'POST',
      url: 'https://stg.example.com/api/orders',
      status: 422,
      durationMs: 263,
      requestHeaders: {
        accept: 'application/json',
        'content-type': 'application/json'
      },
      responseHeaders: {
        'content-type': 'application/json; charset=utf-8'
      },
      responseBodySnippet: JSON.stringify({ code: 'INVALID_QUANTITY', message: '数量は1以上で入力してください。' }),
      startedAt: now - 32_000,
      finishedAt: now - 31_737
    },
    {
      id: 'log-health',
      workspaceId: 'demo-workspace',
      tabId: 'demo-tab',
      resourceType: 'fetch',
      method: 'GET',
      url: 'https://stg.example.com/api/health',
      status: 204,
      durationMs: 72,
      requestHeaders: {
        accept: '*/*'
      },
      responseHeaders: {},
      startedAt: now - 48_000,
      finishedAt: now - 47_928
    },
    {
      id: 'log-timeout',
      workspaceId: 'demo-workspace',
      tabId: 'demo-tab',
      resourceType: 'other',
      method: 'GET',
      url: 'https://stg.example.com/api/reports/slow',
      durationMs: 10_000,
      requestHeaders: {
        accept: 'application/json'
      },
      responseHeaders: {},
      responseBodySnippet: 'net::ERR_TIMED_OUT',
      startedAt: now - 68_000,
      finishedAt: now - 58_000
    }
  ]
};
