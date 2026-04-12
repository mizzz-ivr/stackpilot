import type { EnvironmentType } from './domain/environment';

export type EnvironmentLabel = EnvironmentType;

export interface TabState {
  id: string;
  title: string;
  url: string;
  isActive: boolean;
  workspaceId: string;
}

export interface Workspace {
  id: string;
  name: string;
  environmentType: EnvironmentType;
  customEnvironmentLabel?: string;
  prodDomains: string[];
  partitionKey: string;
  tabs: TabState[];
  createdAt: string;
  updatedAt: string;
}

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
  version: number;
  activeWorkspaceId?: string;
  activeTabId?: string;
  workspaces: Workspace[];
  restoredFromSession?: boolean;
  restoreWarnings?: string[];
}

export type CreateWorkspaceInput = Pick<
  Workspace,
  'name' | 'environmentType' | 'customEnvironmentLabel' | 'prodDomains'
>;
