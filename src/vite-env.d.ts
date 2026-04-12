/// <reference types="vite/client" />
import type { ApiLogEntry, AppSnapshot, CreateWorkspaceInput, Workspace } from '../shared/contracts';
import type { RiskConfirmationRequest } from '../shared/domain/risk';

declare global {
  interface Window {
    stackpilot: {
      workspace: {
        list: () => Promise<AppSnapshot>;
        create: (input: CreateWorkspaceInput) => Promise<Workspace>;
        update: (workspaceId: string, patch: Partial<Workspace>) => Promise<Workspace | null>;
        remove: (workspaceId: string) => Promise<boolean>;
        persistTabs: (workspaceId: string, tabs: Workspace['tabs']) => Promise<boolean>;
      };
      browser: {
        navigate: (workspace: Workspace, tabId: string, url: string) => Promise<boolean>;
        openDevTools: () => Promise<boolean>;
      };
      apiLog: {
        list: (workspaceId: string) => Promise<ApiLogEntry[]>;
        subscribe: (handler: (entry: ApiLogEntry) => void) => () => void;
      };
      riskGuard: {
        subscribe: (handler: (request: RiskConfirmationRequest) => void) => () => void;
        resolve: (confirmationId: string, allow: boolean) => Promise<boolean>;
      };
    };
  }
}

export {};
