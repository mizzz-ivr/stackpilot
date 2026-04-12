import { ipcMain, BrowserWindow } from 'electron';
import type { CreateWorkspaceInput, Workspace } from '../../../shared/contracts';
import { CHANNELS } from './channels';
import { WorkspaceService } from '../services/workspaceService';
import { BrowserViewManager } from '../services/browserViewManager';
import { ApiLogService } from '../services/apiLogService';
import type { RiskConfirmationRequest } from '../../../shared/domain/risk';

export const registerHandlers = (
  mainWindow: BrowserWindow,
  workspaceService: WorkspaceService,
  browserViewManager: BrowserViewManager,
  apiLogService: ApiLogService
): void => {
  const pendingRiskConfirmations = new Map<string, (allow: boolean) => void>();

  apiLogService.setConfirmRiskHandler((request: RiskConfirmationRequest) => {
    if (mainWindow.isDestroyed()) return Promise.resolve(false);

    return new Promise<boolean>((resolve) => {
      pendingRiskConfirmations.set(request.confirmationId, resolve);
      mainWindow.webContents.send(CHANNELS.riskConfirmationRequested, request);
      setTimeout(() => {
        const resolver = pendingRiskConfirmations.get(request.confirmationId);
        if (!resolver) return;
        pendingRiskConfirmations.delete(request.confirmationId);
        resolver(false);
      }, 30_000);
    });
  });

  ipcMain.handle(CHANNELS.riskConfirmationRespond, (_event, confirmationId: string, allow: boolean) => {
    const resolver = pendingRiskConfirmations.get(confirmationId);
    if (!resolver) return false;
    pendingRiskConfirmations.delete(confirmationId);
    resolver(Boolean(allow));
    return true;
  });

  ipcMain.handle(CHANNELS.workspaceList, () => workspaceService.getSnapshot());

  ipcMain.handle(CHANNELS.workspaceCreate, async (_event, input: CreateWorkspaceInput) => {
    return workspaceService.create(input);
  });

  ipcMain.handle(CHANNELS.workspaceUpdate, async (_event, workspaceId: string, patch: Partial<Workspace>) => {
    return workspaceService.update(workspaceId, patch);
  });

  ipcMain.handle(CHANNELS.workspaceDelete, async (_event, workspaceId: string) => {
    return workspaceService.remove(workspaceId);
  });

  ipcMain.handle(CHANNELS.workspacePersistTabs, async (_event, workspaceId: string, tabs: Workspace['tabs']) => {
    await workspaceService.persistTabs(workspaceId, tabs);
    return true;
  });

  ipcMain.handle(CHANNELS.workspaceSetActiveContext, async (_event, workspaceId?: string, tabId?: string) => {
    await workspaceService.setActiveContext(workspaceId, tabId);
    return true;
  });

  ipcMain.handle(CHANNELS.browserNavigate, async (_event, workspace: Workspace, tabId: string, url: string) => {
    browserViewManager.openTab(mainWindow, workspace, tabId, url);
    return true;
  });

  ipcMain.handle(CHANNELS.browserOpenDevTools, () => {
    browserViewManager.openDevTools();
    return true;
  });

  ipcMain.handle(CHANNELS.apiLogList, (_event, workspaceId: string) => apiLogService.list(workspaceId));

  apiLogService.onLog((entry) => {
    mainWindow.webContents.send(CHANNELS.apiLogReceived, entry);
  });
};
