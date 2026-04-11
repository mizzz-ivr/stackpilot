import type { EnvironmentType } from './domain/environment';
import type { WorkspaceModel, WorkspaceTab } from './domain/workspace';

export type EnvironmentLabel = EnvironmentType;

export type TabState = WorkspaceTab;

export type Workspace = WorkspaceModel;

export interface ApiLogEntry {
  id: string;
  workspaceId: string;
  tabId: string;
  type: 'xhr' | 'fetch' | 'other';
  method: string;
  url: string;
  status?: number;
  durationMs?: number;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  responseBodySnippet?: string;
  startedAt: number;
  finishedAt?: number;
}

export interface AppSnapshot {
  version: 1;
  activeWorkspaceId?: string;
  activeTabId?: string;
  workspaces: Workspace[];
}

export type CreateWorkspaceInput = Pick<
  Workspace,
  'name' | 'environmentType' | 'customEnvironmentLabel' | 'prodDomains'
>;
