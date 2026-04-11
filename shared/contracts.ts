export type EnvironmentLabel = 'local' | 'dev' | 'stg' | 'prod' | 'custom';

export interface TabState {
  id: string;
  title: string;
  url: string;
  isActive: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  environment: EnvironmentLabel;
  customEnvironmentLabel?: string;
  prodDomains: string[];
  partition: string;
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
  version: 1;
  activeWorkspaceId?: string;
  workspaces: Workspace[];
}

export type CreateWorkspaceInput = Pick<Workspace, 'name' | 'environment' | 'customEnvironmentLabel' | 'prodDomains'>;
