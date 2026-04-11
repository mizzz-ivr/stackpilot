import type { EnvironmentType } from './environment';
import { getSafetyLevelByEnvironment, type SafetyLevel } from './safety';

export interface WorkspaceTab {
  id: string;
  title: string;
  url: string;
  isActive: boolean;
}

export interface WorkspaceModel {
  id: string;
  name: string;
  environmentType: EnvironmentType;
  customEnvironmentLabel?: string;
  prodDomains: string[];
  partitionKey: string;
  tabs: WorkspaceTab[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceContextRule {
  environmentType: EnvironmentType;
  warningLevel: SafetyLevel;
  showDangerOutline: boolean;
}

export const toWorkspaceContextRule = (workspace: Pick<WorkspaceModel, 'environmentType'>): WorkspaceContextRule => {
  const warningLevel = getSafetyLevelByEnvironment(workspace.environmentType);
  return {
    environmentType: workspace.environmentType,
    warningLevel,
    showDangerOutline: warningLevel === 'danger'
  };
};

export const resolveWorkspaceActiveTabId = (workspace: Pick<WorkspaceModel, 'tabs'>): string | undefined => {
  return workspace.tabs.find((tab) => tab.isActive)?.id ?? workspace.tabs[0]?.id;
};

export const alignWorkspaceTabs = (workspace: Pick<WorkspaceModel, 'tabs'>, activeTabId?: string): WorkspaceTab[] => {
  if (workspace.tabs.length === 0) return [];

  const fallbackId = workspace.tabs[0].id;
  const nextActiveTabId = activeTabId && workspace.tabs.some((tab) => tab.id === activeTabId) ? activeTabId : fallbackId;

  return workspace.tabs.map((tab) => ({ ...tab, isActive: tab.id === nextActiveTabId }));
};
