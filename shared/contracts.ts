import type { EnvironmentType } from './domain/environment';
import type { SafeRequestBodyPreview } from './domain/requestBody';
import type { SafeResponseBodyPreview } from './domain/responseBody';

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
  requestBody?: SafeRequestBodyPreview;
  responseHeaders: Record<string, string>;
  responseBody?: SafeResponseBodyPreview;
  responseBodySnippet?: string;
  startedAt: number;
  finishedAt?: number;
  updatedAt?: number;
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
