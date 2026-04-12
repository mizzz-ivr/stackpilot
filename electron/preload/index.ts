import { contextBridge, ipcRenderer } from 'electron';
import type { ApiLogEntry, AppSnapshot, CreateWorkspaceInput, Workspace } from '../../shared/contracts';
import { CHANNELS } from '../main/ipc/channels';
import type { RiskConfirmationRequest } from '../../shared/domain/risk';

const api = {
  workspace: {
    list: (): Promise<AppSnapshot> => ipcRenderer.invoke(CHANNELS.workspaceList),
    create: (input: CreateWorkspaceInput): Promise<Workspace> => ipcRenderer.invoke(CHANNELS.workspaceCreate, input),
    update: (workspaceId: string, patch: Partial<Workspace>): Promise<Workspace | null> =>
      ipcRenderer.invoke(CHANNELS.workspaceUpdate, workspaceId, patch),
    remove: (workspaceId: string): Promise<boolean> => ipcRenderer.invoke(CHANNELS.workspaceDelete, workspaceId),
    persistTabs: (workspaceId: string, tabs: Workspace['tabs']): Promise<boolean> =>
      ipcRenderer.invoke(CHANNELS.workspacePersistTabs, workspaceId, tabs)
  },
  browser: {
    navigate: (workspace: Workspace, tabId: string, url: string): Promise<boolean> =>
      ipcRenderer.invoke(CHANNELS.browserNavigate, workspace, tabId, url),
    openDevTools: (): Promise<boolean> => ipcRenderer.invoke(CHANNELS.browserOpenDevTools)
  },
  apiLog: {
    list: (workspaceId: string): Promise<ApiLogEntry[]> => ipcRenderer.invoke(CHANNELS.apiLogList, workspaceId),
    subscribe: (handler: (entry: ApiLogEntry) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, entry: ApiLogEntry) => handler(entry);
      ipcRenderer.on(CHANNELS.apiLogReceived, listener);
      return () => ipcRenderer.removeListener(CHANNELS.apiLogReceived, listener);
    }
  },
  riskGuard: {
    subscribe: (handler: (request: RiskConfirmationRequest) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, request: RiskConfirmationRequest) => handler(request);
      ipcRenderer.on(CHANNELS.riskConfirmationRequested, listener);
      return () => ipcRenderer.removeListener(CHANNELS.riskConfirmationRequested, listener);
    },
    resolve: (confirmationId: string, allow: boolean): Promise<boolean> =>
      ipcRenderer.invoke(CHANNELS.riskConfirmationRespond, confirmationId, allow)
  }
};

contextBridge.exposeInMainWorld('stackpilot', api);
