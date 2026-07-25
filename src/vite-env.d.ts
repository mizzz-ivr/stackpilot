/// <reference types="vite/client" />
import type { ApiLogEntry, AppSnapshot, CreateWorkspaceInput, Workspace } from '../shared/contracts';
import type { ApiLogExportRequest } from '../shared/domain/apiLogExport';
import type {
  ApiLogExportDiscardRequest,
  ApiLogExportPreviewResult,
  ApiLogExportSaveRequest,
  ApiLogExportSaveResult
} from '../shared/domain/apiLogExportPreview';
import type { RiskConfirmationRequest } from '../shared/domain/risk';
import type { MobilePairingServerStatus } from '../shared/domain/mobilePairing';

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
        previewExport: (request: ApiLogExportRequest) => Promise<ApiLogExportPreviewResult>;
        saveExport: (request: ApiLogExportSaveRequest) => Promise<ApiLogExportSaveResult>;
        discardExportPreview: (request: ApiLogExportDiscardRequest) => Promise<boolean>;
        subscribe: (handler: (entry: ApiLogEntry) => void) => () => void;
      };
      mobilePairing: {
        getStatus: () => Promise<MobilePairingServerStatus>;
        start: () => Promise<MobilePairingServerStatus>;
        stop: () => Promise<MobilePairingServerStatus>;
        subscribe: (handler: (status: MobilePairingServerStatus) => void) => () => void;
      };
      riskGuard: {
        subscribe: (handler: (request: RiskConfirmationRequest) => void) => () => void;
        resolve: (confirmationId: string, allow: boolean) => Promise<boolean>;
      };
    };
  }
}

export {};
