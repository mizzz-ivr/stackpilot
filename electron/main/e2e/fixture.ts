import type { ApiLogEntry } from '../../../shared/contracts';
import type { SessionSnapshot } from '../../../shared/domain/sessionRestore';

export const stackpilotE2eWorkspaceId = '11111111-1111-4111-8111-111111111111';
export const stackpilotE2eTabId = '22222222-2222-4222-8222-222222222222';
export const stackpilotE2eSensitivePathSegment = 'customer-123';

const fixtureTimestamp = '2026-07-28T00:00:00.000Z';
const fixtureStartedAt = Date.parse(fixtureTimestamp);

export const createStackpilotE2eSessionSnapshot = (): SessionSnapshot => ({
  version: 2,
  activeWorkspaceId: stackpilotE2eWorkspaceId,
  activeTabId: stackpilotE2eTabId,
  workspaces: [
    {
      id: stackpilotE2eWorkspaceId,
      name: 'E2E Workspace',
      environmentType: 'dev',
      prodDomains: [],
      partitionKey: `persist:${stackpilotE2eWorkspaceId}`,
      tabs: [
        {
          id: stackpilotE2eTabId,
          title: 'E2E Fixture',
          url: 'about:blank',
          isActive: true,
          workspaceId: stackpilotE2eWorkspaceId
        }
      ],
      createdAt: fixtureTimestamp,
      updatedAt: fixtureTimestamp
    }
  ]
});

export const createStackpilotE2eApiLogs = (): ApiLogEntry[] => [
  {
    id: '33333333-3333-4333-8333-333333333333',
    workspaceId: stackpilotE2eWorkspaceId,
    tabId: stackpilotE2eTabId,
    type: 'fetch',
    method: 'GET',
    url: `https://api.example.test/users/${stackpilotE2eSensitivePathSegment}/orders?trace=public`,
    status: 200,
    durationMs: 42,
    requestHeaders: {
      accept: 'application/json'
    },
    responseHeaders: {
      'content-type': 'application/json',
      location: `https://api.example.test/users/${stackpilotE2eSensitivePathSegment}/summary`
    },
    responseBody: {
      kind: 'json',
      contentType: 'application/json',
      content: '{"status":"ok"}',
      byteLength: 15,
      isTruncated: false,
      redactedFieldPaths: []
    },
    startedAt: fixtureStartedAt,
    finishedAt: fixtureStartedAt + 42,
    updatedAt: fixtureStartedAt + 42
  }
];
