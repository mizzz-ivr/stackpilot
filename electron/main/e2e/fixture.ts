import type { Session, Workspace } from 'electron';
import type { Workspace as StackpilotWorkspace } from '../../../shared/contracts';
import type { SessionSnapshot } from '../../../shared/domain/sessionRestore';
import { ApiLogService } from '../services/apiLogService';

export const stackpilotE2eWorkspaceId = '11111111-1111-4111-8111-111111111111';
export const stackpilotE2eTabId = '22222222-2222-4222-8222-222222222222';
export const stackpilotE2eSensitivePathSegment = 'customer-123';

const fixtureTimestamp = '2026-07-28T00:00:00.000Z';
const fixtureUrl = `https://api.example.test/users/${stackpilotE2eSensitivePathSegment}/orders?trace=public`;

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
): Promise<void> => {
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

  await new Promise<void>((resolve, reject) => {
    beforeRequest(
      {
        id: 1,
        method: 'GET',
        url: fixtureUrl,
        resourceType: 'xhr',
        webContentsId: 1
      },
      ({ cancel }) => {
        if (cancel) {
          reject(new Error('E2E固定ログのrequestがキャンセルされました。'));
          return;
        }
        resolve();
      }
    );
  });

  beforeSendHeaders(
    {
      id: 1,
      requestHeaders: {
        accept: 'application/json'
      }
    },
    () => undefined
  );

  completed({
    id: 1,
    method: 'GET',
    url: fixtureUrl,
    statusCode: 200,
    responseHeaders: {
      'content-type': 'application/json',
      location: `https://api.example.test/users/${stackpilotE2eSensitivePathSegment}/summary`
    }
  });
};
