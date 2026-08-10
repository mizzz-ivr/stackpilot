import { describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import type { ApiLogEntry, AppSnapshot, Workspace } from '../../shared/contracts';
import type { ApiLogService } from '../../electron/main/services/apiLogService';
import type { WorkspaceService } from '../../electron/main/services/workspaceService';

const mocks = vi.hoisted(() => ({
  showMessageBox: vi.fn()
}));

vi.mock('electron', () => ({
  dialog: {
    showMessageBox: mocks.showMessageBox
  }
}));

import { RequestReplayService } from '../../electron/main/services/requestReplayService';

const createWorkspace = (overrides: Partial<Workspace> = {}): Workspace => ({
  id: 'workspace-1',
  name: 'Workspace',
  environmentType: 'dev',
  prodDomains: [],
  partitionKey: 'persist:workspace-1',
  tabs: [],
  createdAt: '2026-08-07T00:00:00.000Z',
  updatedAt: '2026-08-07T00:00:00.000Z',
  ...overrides
});

const createLog = (overrides: Partial<ApiLogEntry> = {}): ApiLogEntry => ({
  id: 'log-1',
  workspaceId: 'workspace-1',
  tabId: 'tab-1',
  type: 'xhr',
  method: 'GET',
  url: 'https://api.example.test/users?trace=1',
  status: 200,
  durationMs: 80,
  requestHeaders: {},
  responseHeaders: {},
  startedAt: 1_000,
  ...overrides
});

const createService = ({
  workspaces = [createWorkspace()],
  logsByWorkspace = { 'workspace-1': [createLog()] },
  executeReplay = vi.fn(async () => ({ status: 'replayed' as const, responseStatus: 204, durationMs: 42 }))
}: {
  workspaces?: Workspace[];
  logsByWorkspace?: Record<string, ApiLogEntry[]>;
  executeReplay?: ReturnType<typeof vi.fn>;
} = {}) => {
  const snapshot: AppSnapshot = {
    version: 2,
    workspaces,
    activeWorkspaceId: workspaces[0]?.id
  };
  const workspaceService = {
    getSnapshot: () => snapshot
  } as unknown as WorkspaceService;
  const apiLogService = {
    list: (workspaceId: string) => logsByWorkspace[workspaceId] ?? []
  } as unknown as ApiLogService;
  const mainWindow = {
    isDestroyed: () => false
  } as unknown as BrowserWindow;

  return {
    executeReplay,
    service: new RequestReplayService(mainWindow, workspaceService, apiLogService, executeReplay)
  };
};

describe('RequestReplayService', () => {
  it('main processで元ログのmethodとURLを再取得してexecutorへ渡す', async () => {
    const { service, executeReplay } = createService();

    const result = await service.replay({ workspaceId: 'workspace-1', logId: 'log-1' });

    expect(result).toEqual({ status: 'replayed', responseStatus: 204, durationMs: 42 });
    expect(executeReplay).toHaveBeenCalledWith(
      'workspace-1',
      'GET',
      'https://api.example.test/users?trace=1'
    );
  });

  it('POSTはmain processでも拒否してexecutorを呼ばない', async () => {
    const executeReplay = vi.fn();
    const { service } = createService({
      logsByWorkspace: {
        'workspace-1': [createLog({ method: 'POST' })]
      },
      executeReplay
    });

    const result = await service.replay({ workspaceId: 'workspace-1', logId: 'log-1' });

    expect(result).toMatchObject({ status: 'failed', errorCode: 'not-replayable' });
    expect(executeReplay).not.toHaveBeenCalled();
  });

  it('別WorkspaceのログIDを指定したrequestを拒否する', async () => {
    const otherWorkspace = createWorkspace({
      id: 'workspace-2',
      name: 'Other',
      partitionKey: 'persist:workspace-2'
    });
    const { service } = createService({
      workspaces: [createWorkspace(), otherWorkspace],
      logsByWorkspace: {
        'workspace-1': [],
        'workspace-2': [createLog({ id: 'other-log', workspaceId: 'workspace-2' })]
      }
    });

    const result = await service.replay({ workspaceId: 'workspace-1', logId: 'other-log' });

    expect(result).toMatchObject({ status: 'failed', errorCode: 'workspace-mismatch' });
  });

  it('PROD確認をキャンセルした場合はexecutorを呼ばない', async () => {
    mocks.showMessageBox.mockResolvedValueOnce({ response: 0, checkboxChecked: false });
    const executeReplay = vi.fn();
    const { service } = createService({
      workspaces: [createWorkspace({ environmentType: 'prod' })],
      executeReplay
    });

    const result = await service.replay({ workspaceId: 'workspace-1', logId: 'log-1' });

    expect(result).toEqual({ status: 'cancelled' });
    expect(mocks.showMessageBox).toHaveBeenCalledTimes(1);
    expect(executeReplay).not.toHaveBeenCalled();
  });

  it('同一ログの並列Replayをmain processで拒否する', async () => {
    let resolveExecution: ((value: { status: 'replayed'; responseStatus: number; durationMs: number }) => void) | undefined;
    const executeReplay = vi.fn(() => new Promise<{ status: 'replayed'; responseStatus: number; durationMs: number }>((resolve) => {
      resolveExecution = resolve;
    }));
    const { service } = createService({ executeReplay });

    const first = service.replay({ workspaceId: 'workspace-1', logId: 'log-1' });
    const second = await service.replay({ workspaceId: 'workspace-1', logId: 'log-1' });

    expect(second).toMatchObject({ status: 'failed', errorCode: 'replay-in-progress' });
    expect(executeReplay).toHaveBeenCalledTimes(1);

    resolveExecution?.({ status: 'replayed', responseStatus: 200, durationMs: 10 });
    await expect(first).resolves.toMatchObject({ status: 'replayed', responseStatus: 200 });
  });
});
