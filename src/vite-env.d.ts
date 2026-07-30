/// <reference types="vite/client" />
import type { ApiLogEntry, AppSnapshot, CreateWorkspaceInput, Workspace } from '../shared/contracts';
import type {
  StackpilotIpcEventSubscriber,
  StackpilotIpcInvokeMethod
} from '../shared/domain/ipcPayloads';

declare global {
  interface Window {
    stackpilot: {
      workspace: {
        list: () => Promise<AppSnapshot>;
        create: (input: CreateWorkspaceInput) => Promise<Workspace>;
        update: (workspaceId: string, patch: Partial<Workspace>) => Promise<Workspace | null>;
        remove: (workspaceId: string) => Promise<boolean>;
        persistTabs: (workspaceId: string, tabs: Workspace['tabs']) => Promise<boolean>;
        setActiveContext: (workspaceId?: string, tabId?: string) => Promise<boolean>;
      };
      browser: {
        navigate: (workspace: Workspace, tabId: string, url: string) => Promise<boolean>;
        openDevTools: () => Promise<boolean>;
      };
      apiLog: {
        list: (workspaceId: string) => Promise<ApiLogEntry[]>;
        previewExport: StackpilotIpcInvokeMethod<'api-log:export-preview'>;
        saveExport: StackpilotIpcInvokeMethod<'api-log:export-save'>;
        discardExportPreview: StackpilotIpcInvokeMethod<'api-log:export-discard'>;
        subscribe: (handler: (entry: ApiLogEntry) => void) => () => void;
      };
      mobilePairing: {
        getStatus: StackpilotIpcInvokeMethod<'mobile-pairing:get-status'>;
        start: StackpilotIpcInvokeMethod<'mobile-pairing:start'>;
        stop: StackpilotIpcInvokeMethod<'mobile-pairing:stop'>;
        subscribe: StackpilotIpcEventSubscriber<'mobile-pairing:status-changed'>;
      };
      riskGuard: {
        subscribe: StackpilotIpcEventSubscriber<'risk:confirmation-requested'>;
        resolve: StackpilotIpcInvokeMethod<'risk:confirmation-respond'>;
      };
    };
  }
}

export {};
