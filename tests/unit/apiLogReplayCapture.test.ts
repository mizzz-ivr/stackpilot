import { describe, expect, it } from 'vitest';
import type { Session } from 'electron';
import type { Workspace } from '../../shared/contracts';
import { ApiLogService } from '../../electron/main/services/apiLogService';

const workspace: Workspace = {
  id: 'workspace-1',
  name: 'Workspace',
  environmentType: 'dev',
  prodDomains: [],
  partitionKey: 'persist:workspace-1',
  tabs: [],
  createdAt: '2026-08-12T00:00:00.000Z',
  updatedAt: '2026-08-12T00:00:00.000Z'
};

const targetUrl = 'https://api.example.test/users?trace=edited';

type BeforeRequest = (
  details: {
    id: number;
    method: string;
    url: string;
    resourceType: string;
    webContentsId: number;
  },
  callback: (response: { cancel: boolean }) => void
) => void;

type BeforeSendHeaders = (
  details: { id: number; requestHeaders: Record<string, string> },
  callback: (response: { requestHeaders?: Record<string, string> }) => void
) => void;

type Completed = (details: {
  id: number;
  method: string;
  url: string;
  statusCode: number;
  responseHeaders: Record<string, string>;
}) => void;

const createFixture = () => {
  let beforeRequest: BeforeRequest | undefined;
  let beforeSendHeaders: BeforeSendHeaders | undefined;
  let completed: Completed | undefined;

  const session = {
    webRequest: {
      onBeforeRequest: (listener: BeforeRequest) => {
        beforeRequest = listener;
      },
      onBeforeSendHeaders: (listener: BeforeSendHeaders) => {
        beforeSendHeaders = listener;
      },
      onCompleted: (listener: Completed) => {
        completed = listener;
      },
      onErrorOccurred: () => undefined
    }
  } as unknown as Session;

  const service = new ApiLogService();
  service.attachSession(session, workspace, () => 'tab-1');

  return {
    service,
    getBeforeRequest: () => beforeRequest!,
    getBeforeSendHeaders: () => beforeSendHeaders!,
    getCompleted: () => completed!
  };
};

const startRequest = async (listener: BeforeRequest, id: number, url = targetUrl): Promise<void> =>
  new Promise((resolve, reject) => {
    listener(
      {
        id,
        method: 'GET',
        url,
        resourceType: 'xhr',
        webContentsId: 10
      },
      ({ cancel }) => cancel ? reject(new Error('request cancelled')) : resolve()
    );
  });

describe('ApiLogService Replay capture', () => {
  it('一致するwebRequestへcaptureを結び付け、生成ログIDで完了する', async () => {
    const fixture = createFixture();
    const reservation = fixture.service.beginReplayCapture({
      workspaceId: workspace.id,
      tabId: 'tab-1',
      method: 'GET',
      url: targetUrl
    });

    await startRequest(fixture.getBeforeRequest(), 1);
    fixture.getBeforeSendHeaders()(
      { id: 1, requestHeaders: { accept: 'application/json' } },
      () => undefined
    );
    fixture.getCompleted()({
      id: 1,
      method: 'GET',
      url: targetUrl,
      statusCode: 204,
      responseHeaders: { 'content-type': 'application/json' }
    });

    const replayedLogId = await reservation.result;
    const log = fixture.service.list(workspace.id).find((entry) => entry.id === replayedLogId);

    expect(replayedLogId).toBeTruthy();
    expect(log).toMatchObject({
      workspaceId: workspace.id,
      tabId: 'tab-1',
      method: 'GET',
      url: targetUrl,
      status: 204
    });
  });

  it('一致しないURLの通信では予約を消費しない', async () => {
    const fixture = createFixture();
    const reservation = fixture.service.beginReplayCapture({
      workspaceId: workspace.id,
      tabId: 'tab-1',
      method: 'GET',
      url: targetUrl
    });

    await startRequest(
      fixture.getBeforeRequest(),
      2,
      'https://api.example.test/users?trace=other'
    );
    reservation.cancel();

    await expect(reservation.result).resolves.toBeUndefined();
  });
});