import { contextBridge, ipcRenderer } from 'electron';
import type { ApiLogEntry, AppSnapshot, CreateWorkspaceInput, Workspace } from '../../shared/contracts';
import type { StackpilotIpcChannels } from '../../shared/domain/ipcChannels';
import type {
  StackpilotIpcEventPayload,
  StackpilotIpcEventSubscriber,
  StackpilotIpcInvokeMethod
} from '../../shared/domain/ipcPayloads';
import type { MobilePairingServerStatus } from '../../shared/domain/mobilePairing';

// sandbox preloadではローカルCommonJSモジュールをrequireできないため、
// channel値はここで保持し、sharedの型契約とCIのAST比較でmain process側との同期を保証する。
const CHANNELS = {
  workspaceList: 'workspace:list',
  workspaceCreate: 'workspace:create',
  workspaceUpdate: 'workspace:update',
  workspaceDelete: 'workspace:delete',
  workspacePersistTabs: 'workspace:persist-tabs',
  workspaceSetActiveContext: 'workspace:set-active-context',
  browserNavigate: 'browser:navigate',
  browserOpenDevTools: 'browser:open-devtools',
  apiLogList: 'api-log:list',
  apiLogExportPreview: 'api-log:export-preview',
  apiLogExportSave: 'api-log:export-save',
  apiLogExportDiscard: 'api-log:export-discard',
  apiLogReceived: 'api-log:received',
  riskConfirmationRequested: 'risk:confirmation-requested',
  riskConfirmationRespond: 'risk:confirmation-respond',
  mobilePairingGetStatus: 'mobile-pairing:get-status',
  mobilePairingStart: 'mobile-pairing:start',
  mobilePairingStop: 'mobile-pairing:stop',
  mobilePairingStatusChanged: 'mobile-pairing:status-changed'
} as const satisfies StackpilotIpcChannels;

const previewApiLogExport: StackpilotIpcInvokeMethod<typeof CHANNELS.apiLogExportPreview> =
  (request) => ipcRenderer.invoke(CHANNELS.apiLogExportPreview, request);

const saveApiLogExport: StackpilotIpcInvokeMethod<typeof CHANNELS.apiLogExportSave> =
  (request) => ipcRenderer.invoke(CHANNELS.apiLogExportSave, request);

const discardApiLogExport: StackpilotIpcInvokeMethod<typeof CHANNELS.apiLogExportDiscard> =
  (request) => ipcRenderer.invoke(CHANNELS.apiLogExportDiscard, request);

const subscribeRiskConfirmation: StackpilotIpcEventSubscriber<
  typeof CHANNELS.riskConfirmationRequested
> = (handler) => {
  const listener = (
    _event: Electron.IpcRendererEvent,
    request: StackpilotIpcEventPayload<typeof CHANNELS.riskConfirmationRequested>
  ) => handler(request);
  ipcRenderer.on(CHANNELS.riskConfirmationRequested, listener);
  return () => ipcRenderer.removeListener(CHANNELS.riskConfirmationRequested, listener);
};

const resolveRiskConfirmation: StackpilotIpcInvokeMethod<
  typeof CHANNELS.riskConfirmationRespond
> = (confirmationId, allow) =>
  ipcRenderer.invoke(CHANNELS.riskConfirmationRespond, confirmationId, allow);

const api = {
  workspace: {
    list: (): Promise<AppSnapshot> => ipcRenderer.invoke(CHANNELS.workspaceList),
    create: (input: CreateWorkspaceInput): Promise<Workspace> => ipcRenderer.invoke(CHANNELS.workspaceCreate, input),
    update: (workspaceId: string, patch: Partial<Workspace>): Promise<Workspace | null> =>
      ipcRenderer.invoke(CHANNELS.workspaceUpdate, workspaceId, patch),
    remove: (workspaceId: string): Promise<boolean> => ipcRenderer.invoke(CHANNELS.workspaceDelete, workspaceId),
    persistTabs: (workspaceId: string, tabs: Workspace['tabs']): Promise<boolean> =>
      ipcRenderer.invoke(CHANNELS.workspacePersistTabs, workspaceId, tabs),
    setActiveContext: (workspaceId?: string, tabId?: string): Promise<boolean> =>
      ipcRenderer.invoke(CHANNELS.workspaceSetActiveContext, workspaceId, tabId)
  },
  browser: {
    navigate: (workspace: Workspace, tabId: string, url: string): Promise<boolean> =>
      ipcRenderer.invoke(CHANNELS.browserNavigate, workspace, tabId, url),
    openDevTools: (): Promise<boolean> => ipcRenderer.invoke(CHANNELS.browserOpenDevTools)
  },
  apiLog: {
    list: (workspaceId: string): Promise<ApiLogEntry[]> => ipcRenderer.invoke(CHANNELS.apiLogList, workspaceId),
    previewExport: previewApiLogExport,
    saveExport: saveApiLogExport,
    discardExportPreview: discardApiLogExport,
    subscribe: (handler: (entry: ApiLogEntry) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, entry: ApiLogEntry) => handler(entry);
      ipcRenderer.on(CHANNELS.apiLogReceived, listener);
      return () => ipcRenderer.removeListener(CHANNELS.apiLogReceived, listener);
    }
  },
  mobilePairing: {
    getStatus: (): Promise<MobilePairingServerStatus> => ipcRenderer.invoke(CHANNELS.mobilePairingGetStatus),
    start: (): Promise<MobilePairingServerStatus> => ipcRenderer.invoke(CHANNELS.mobilePairingStart),
    stop: (): Promise<MobilePairingServerStatus> => ipcRenderer.invoke(CHANNELS.mobilePairingStop),
    subscribe: (handler: (status: MobilePairingServerStatus) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, status: MobilePairingServerStatus) => handler(status);
      ipcRenderer.on(CHANNELS.mobilePairingStatusChanged, listener);
      return () => ipcRenderer.removeListener(CHANNELS.mobilePairingStatusChanged, listener);
    }
  },
  riskGuard: {
    subscribe: subscribeRiskConfirmation,
    resolve: resolveRiskConfirmation
  }
};

contextBridge.exposeInMainWorld('stackpilot', api);
