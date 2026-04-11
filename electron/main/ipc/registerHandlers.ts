import { ipcMain, BrowserWindow } from 'electron';
import type { CreateWorkspaceInput, Workspace } from '../../../shared/contracts';
import { CHANNELS } from './channels';
import { WorkspaceService } from '../services/workspaceService';
import { BrowserViewManager } from '../services/browserViewManager';
import { ApiLogService } from '../services/apiLogService';

export const registerHandlers = (
  mainWindow: BrowserWindow,
  workspaceService: WorkspaceService,
  browserViewManager: BrowserViewManager,
  apiLogService: ApiLogService
): void => {
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

  ipcMain.handle(CHANNELS.browserNavigate, async (_event, workspace: Workspace, tabId: string, url: string) => {
    browserViewManager.openTab(mainWindow, workspace, tabId, url);
    return true;
  });

  ipcMain.handle(CHANNELS.browserOpenDevTools, () => {
    browserViewManager.openDevTools();
    return true;
  });

  ipcMain.handle(CHANNELS.apiLogList, (_event, workspaceId: string) => apiLogService.list(workspaceId));
};
