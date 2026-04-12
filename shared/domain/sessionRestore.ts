import { buildWorkspacePartition } from './partition';
import type { AppSnapshot, TabState, Workspace } from '../contracts';
import { environmentTypes, type EnvironmentType } from './environment';

const SESSION_SNAPSHOT_VERSION = 2;

export interface SessionSnapshot {
  version: number;
  activeWorkspaceId?: string;
  activeTabId?: string;
  workspaces: Workspace[];
  ui?: {
    window?: {
      width?: number;
      height?: number;
    };
  };
}

export interface SessionRestoreResult {
  snapshot: AppSnapshot;
  warnings: string[];
  restored: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isEnvironmentType = (value: unknown): value is EnvironmentType =>
  typeof value === 'string' && (environmentTypes as readonly string[]).includes(value);

const safeString = (value: unknown, fallback: string): string => (typeof value === 'string' && value.length > 0 ? value : fallback);

const toTab = (value: unknown, workspaceId: string, index: number): TabState | null => {
  if (!isRecord(value)) return null;
  const id = safeString(value.id, `tab-${index + 1}`);
  const title = safeString(value.title, 'New Tab');
  const url = safeString(value.url, 'https://example.com');

  return {
    id,
    title,
    url,
    isActive: Boolean(value.isActive),
    workspaceId
  };
};

const normalizeWorkspace = (value: unknown, index: number, warnings: string[]): Workspace | null => {
  if (!isRecord(value)) return null;

  const id = safeString(value.id, `workspace-${index + 1}`);
  const environmentRaw = value.environmentType ?? value.environment;
  const environmentType: EnvironmentType = isEnvironmentType(environmentRaw) ? environmentRaw : 'dev';

  if (!isEnvironmentType(environmentRaw)) {
    warnings.push(`workspace:${id}:invalid-environmentType`);
  }

  const tabsRaw = Array.isArray(value.tabs) ? value.tabs : [];
  let tabs = tabsRaw
    .map((tab, tabIndex) => toTab(tab, id, tabIndex))
    .filter((tab): tab is TabState => Boolean(tab));

  if (tabs.length === 0) {
    warnings.push(`workspace:${id}:tabs-empty`);
    tabs = [{ id: `tab-${id}`, title: 'New Tab', url: 'https://example.com', isActive: true, workspaceId: id }];
  }

  const activeTabs = tabs.filter((tab) => tab.isActive);
  if (activeTabs.length === 0) {
    tabs = tabs.map((tab, tabIndex) => ({ ...tab, isActive: tabIndex === 0 }));
    warnings.push(`workspace:${id}:active-tab-fallback`);
  }

  if (activeTabs.length > 1) {
    tabs = tabs.map((tab, tabIndex) => ({ ...tab, isActive: tabIndex === 0 }));
    warnings.push(`workspace:${id}:multiple-active-tabs`);
  }

  const now = new Date().toISOString();
  const partitionKey = safeString(value.partitionKey ?? value.partition, buildWorkspacePartition(id));
  if (!value.partitionKey && !value.partition) {
    warnings.push(`workspace:${id}:partitionKey-regenerated`);
  }

  return {
    id,
    name: safeString(value.name, `Workspace ${index + 1}`),
    environmentType,
    customEnvironmentLabel: typeof value.customEnvironmentLabel === 'string' ? value.customEnvironmentLabel : undefined,
    prodDomains: Array.isArray(value.prodDomains) ? value.prodDomains.filter((item): item is string => typeof item === 'string') : [],
    partitionKey,
    tabs,
    createdAt: safeString(value.createdAt, now),
    updatedAt: safeString(value.updatedAt, now)
  };
};

const emptySnapshot = (): AppSnapshot => ({
  version: SESSION_SNAPSHOT_VERSION,
  workspaces: [],
  restoredFromSession: false,
  restoreWarnings: []
});

export const restoreSessionSnapshot = (raw: unknown): SessionRestoreResult => {
  const warnings: string[] = [];

  if (!isRecord(raw)) {
    return { snapshot: emptySnapshot(), warnings: ['snapshot:invalid-root'], restored: false };
  }

  if (typeof raw.version !== 'number' || ![1, SESSION_SNAPSHOT_VERSION].includes(raw.version)) {
    return { snapshot: emptySnapshot(), warnings: ['snapshot:unsupported-version'], restored: false };
  }

  const workspacesRaw = Array.isArray(raw.workspaces) ? raw.workspaces : [];
  const workspaces = workspacesRaw
    .map((workspace, workspaceIndex) => normalizeWorkspace(workspace, workspaceIndex, warnings))
    .filter((workspace): workspace is Workspace => Boolean(workspace));

  const requestedWorkspaceId = typeof raw.activeWorkspaceId === 'string' ? raw.activeWorkspaceId : undefined;
  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === requestedWorkspaceId) ??
    workspaces[0];

  if (requestedWorkspaceId && activeWorkspace?.id !== requestedWorkspaceId) {
    warnings.push('snapshot:activeWorkspaceId-fallback');
  }

  const requestedTabId = typeof raw.activeTabId === 'string' ? raw.activeTabId : undefined;
  const activeTab = requestedTabId ? activeWorkspace?.tabs.find((tab) => tab.id === requestedTabId) : undefined;
  const fallbackTab = activeWorkspace?.tabs.find((tab) => tab.isActive) ?? activeWorkspace?.tabs[0];

  if (requestedTabId && !activeTab) {
    warnings.push('snapshot:activeTabId-fallback');
  }

  const snapshot: AppSnapshot = {
    version: SESSION_SNAPSHOT_VERSION,
    activeWorkspaceId: activeWorkspace?.id,
    activeTabId: activeTab?.id ?? fallbackTab?.id,
    workspaces,
    restoredFromSession: true,
    restoreWarnings: warnings
  };

  return {
    snapshot,
    warnings,
    restored: true
  };
};

export const createSessionSnapshot = (
  state: Pick<AppSnapshot, 'activeWorkspaceId' | 'activeTabId' | 'workspaces'>,
  ui?: SessionSnapshot['ui']
): SessionSnapshot => ({
  version: SESSION_SNAPSHOT_VERSION,
  activeWorkspaceId: state.activeWorkspaceId,
  activeTabId: state.activeTabId,
  workspaces: state.workspaces,
  ui
});
