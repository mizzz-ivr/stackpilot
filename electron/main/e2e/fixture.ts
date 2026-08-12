import type { Session } from 'electron';
import type { Workspace as StackpilotWorkspace } from '../../../shared/contracts';
import type { SessionSnapshot } from '../../../shared/domain/sessionRestore';
import { ApiLogService } from '../services/apiLogService';

export const stackpilotE2eWorkspaceId = '11111111-1111-4111-8111-111111111111';
export const stackpilotE2eTabId = '22222222-2222-4222-8222-222222222222';
export const stackpilotE2eSensitivePathSegment = 'customer-123';

const fixtureTimestamp = '2026-07-28T00:00:00.000Z';
const fixtureUrl = `https://api.example.test/users/${stackpilotE2eSensitivePathSegment}/orders?trace=public`;
const comparisonFixtureUrl = 'https://api.example.test/health?region=jp';
export const stackpilotE2eReplayResultUrl = `https://api.example.test/users/${stackpilotE2eSensitivePathSegment}/orders?trace=edited&flag=`;

export interface StackpilotE2eApiLogFixture {
  seedReplayResult: () => Promise<string>;
}

export const isStackpilotE2eMode = (): boolean => process.env.STACKPILOT_E2E === '1';

export const createStackpilotE2eSessionSnapshot = (): SessionSnapshot => ({
  version: 2,
  activeWorkspaceId: stackpilotE2eWorkspaceId,
  activeTabId: stackpilotE2eTabId,
  workspaces: [createStackpilotE2eWorkspace()]
});

export const createStackpilotE2eWorkspace = (): StackpilotWorkspace => ({
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
});

export const seedStackpilotE2eApiLog = async (
  apiLogService: ApiLogService,
  workspace: StackpilotWorkspace
): Promise<StackpilotE2eApiLogFixture> => {
  let beforeRequestListener: unknown;
  let beforeSendHeadersListener: unknown;
  let completedListener: unknown;

  const fixtureSession = {
    webRequest: {
      onBeforeRequest: (listener: unknown) => {
        beforeRequestListener = listener;
      },
      onBeforeSendHeaders: (listener: unknown) => {
        beforeSendHeadersListener = listener;
      },
      onCompleted: (listener: unknown) => {
        completedListener = listener;
      },
      onErrorOccurred: () => undefined
    }
  } as unknown as Session;

  apiLogService.attachSession(fixtureSession, workspace, () => stackpilotE2eTabId);

  const beforeRequest = beforeRequestListener as (
    details: {
      id: number;
      method: string;
      url: string;
      resourceType: string;
      webContentsId: number;
    },
    callback: (response: { cancel: boolean }) => void
  ) => void;
  const beforeSendHeaders = beforeSendHeadersListener as (
    details: { id: number; requestHeaders: Record<string, string> },
    callback: (response: { requestHeaders?: Record<string, string> }) => void
  ) => void;
  const completed = completedListener as (details: {
    id: number;
    method: string;
    url: string;
    statusCode: number;
    responseHeaders: Record<string, string>;
  }) => void;

  const seedRequest = async ({
    id,
    method,
    url,
    resourceType,
    requestHeaders,
    statusCode,
    responseHeaders
  }: {
    id: number;
    method: string;
    url: string;
    resourceType: 'xhr' | 'fetch';
    requestHeaders: Record<string, string>;
    statusCode: number;
    responseHeaders: Record<string, string>;
  }): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      beforeRequest(
        {
          id,
          method,
          url,
          resourceType,
          webContentsId: 1
        },
        ({ cancel }) => {
          if (cancel) {
            reject(new Error(`E2E固定ログ${id}のrequestがキャンセルされました。`));
            return;
          }
          resolve();
        }
      );
    });

    beforeSendHeaders(
      {
        id,
        requestHeaders
      },
      () => undefined
    );

    completed({
      id,
      method,
      url,
      statusCode,
      responseHeaders
    });
  };

  await seedRequest({
    id: 1,
    method: 'GET',
    url: fixtureUrl,
    resourceType: 'xhr',
    requestHeaders: {
      accept: 'application/json'
    },
    statusCode: 200,
    responseHeaders: {
      'content-type': 'application/json',
      location: `https://api.example.test/users/${stackpilotE2eSensitivePathSegment}/summary`
    }
  });

  await seedRequest({
    id: 2,
    method: 'POST',
    url: comparisonFixtureUrl,
    resourceType: 'fetch',
    requestHeaders: {
      accept: 'application/json',
      'x-retry-mode': 'manual'
    },
    statusCode: 503,
    responseHeaders: {
      'content-type': 'application/json',
      'retry-after': '30'
    }
  });

  return {
    seedReplayResult: async () => {
      const existing = apiLogService
        .list(workspace.id)
        .find((entry) => entry.url === stackpilotE2eReplayResultUrl);
      if (existing) return existing.id;

      await seedRequest({
        id: 3,
        method: 'GET',
        url: stackpilotE2eReplayResultUrl,
        resourceType: 'xhr',
        requestHeaders: {
          accept: 'application/json'
        },
        statusCode: 204,
        responseHeaders: {
          'content-type': 'application/json',
          'x-stackpilot-fixture': 'replay-result'
        }
      });

      const replayed = apiLogService
        .list(workspace.id)
        .find((entry) => entry.url === stackpilotE2eReplayResultUrl);
      if (!replayed) {
        throw new Error('Electron E2E用Replay結果ログを生成できませんでした。');
      }
      return replayed.id;
    }
  };
};