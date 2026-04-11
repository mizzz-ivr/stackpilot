import { contextBridge, ipcRenderer } from 'electron';
import type { ApiLogEntry, AppSnapshot, CreateWorkspaceInput, Workspace } from '../../shared/contracts';

const channels = {
  workspaceList: 'workspace:list',
  workspaceCreate: 'workspace:create',
  workspaceUpdate: 'workspace:update',
  workspaceDelete: 'workspace:delete',
  workspacePersistTabs: 'workspace:persist-tabs',
  browserNavigate: 'browser:navigate',
  browserOpenDevTools: 'browser:open-devtools',
  apiLogList: 'api-log:list'
} as const;

const api = {
  workspace: {
    list: (): Promise<AppSnapshot> => ipcRenderer.invoke(channels.workspaceList),
    create: (input: CreateWorkspaceInput): Promise<Workspace> => ipcRenderer.invoke(channels.workspaceCreate, input),
    update: (workspaceId: string, patch: Partial<Workspace>): Promise<Workspace | null> =>
      ipcRenderer.invoke(channels.workspaceUpdate, workspaceId, patch),
    remove: (workspaceId: string): Promise<boolean> => ipcRenderer.invoke(channels.workspaceDelete, workspaceId),
    persistTabs: (workspaceId: string, tabs: Workspace['tabs']): Promise<boolean> =>
      ipcRenderer.invoke(channels.workspacePersistTabs, workspaceId, tabs)
  },
  browser: {
    navigate: (workspace: Workspace, tabId: string, url: string): Promise<boolean> =>
      ipcRenderer.invoke(channels.browserNavigate, workspace, tabId, url),
    openDevTools: (): Promise<boolean> => ipcRenderer.invoke(channels.browserOpenDevTools)
  },
  apiLog: {
    list: (workspaceId: string): Promise<ApiLogEntry[]> => ipcRenderer.invoke(channels.apiLogList, workspaceId)
  }
};

contextBridge.exposeInMainWorld('stackpilot', api);
