import { create } from 'zustand';
import type { ApiLogEntry, AppSnapshot, Workspace } from '../../shared/contracts';
import type { EnvironmentType } from '../../shared/domain/environment';
import { completeWorkspaceSwitch, createInitialWorkspaceSwitchState, startWorkspaceSwitch } from '../../shared/domain/workspaceState';

interface CreateWorkspaceFormInput {
  name: string;
  environmentType: EnvironmentType;
  customEnvironmentLabel?: string;
}

interface AppState {
  snapshot?: AppSnapshot;
  activeWorkspace?: Workspace;
  activeWorkspaceId?: string;
  switchingWorkspaceId?: string;
  activeTabId?: string;
  apiLogs: ApiLogEntry[];
  load: () => Promise<void>;
  selectWorkspace: (workspaceId: string) => Promise<void>;
  navigate: (url: string) => Promise<void>;
  openDevTools: () => Promise<void>;
  createWorkspace: (input: CreateWorkspaceFormInput) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  ...createInitialWorkspaceSwitchState(),
  apiLogs: [],
  load: async () => {
    const snapshot = await window.stackpilot.workspace.list();
    const activeWorkspace = snapshot.workspaces.find((w) => w.id === snapshot.activeWorkspaceId) ?? snapshot.workspaces[0];
    const activeTabId = activeWorkspace?.tabs.find((tab) => tab.isActive)?.id ?? activeWorkspace?.tabs[0]?.id;
    const apiLogs = activeWorkspace ? await window.stackpilot.apiLog.list(activeWorkspace.id) : [];
    set({
      snapshot,
      activeWorkspace,
      activeWorkspaceId: activeWorkspace?.id,
      activeTabId,
      apiLogs,
      switchingWorkspaceId: undefined
    });
  },
  selectWorkspace: async (workspaceId) => {
    const snapshot = get().snapshot;
    if (!snapshot) return;
    const targetWorkspace = snapshot.workspaces.find((w) => w.id === workspaceId);
    if (!targetWorkspace) return;

    set((state) => startWorkspaceSwitch(state, workspaceId));

    const activeTab = targetWorkspace.tabs.find((tab) => tab.isActive) ?? targetWorkspace.tabs[0];
    if (activeTab) {
      await window.stackpilot.browser.navigate(targetWorkspace, activeTab.id, activeTab.url);
    }
    const apiLogs = await window.stackpilot.apiLog.list(workspaceId);

    set((state) => ({
      ...completeWorkspaceSwitch(state, workspaceId),
      activeWorkspace: targetWorkspace,
      activeTabId: activeTab?.id,
      apiLogs
    }));
  },
  navigate: async (url) => {
    const { activeWorkspace, activeTabId } = get();
    if (!activeWorkspace || !activeTabId) return;
    await window.stackpilot.browser.navigate(activeWorkspace, activeTabId, url);
    const updatedTabs = activeWorkspace.tabs.map((tab) =>
      tab.id === activeTabId ? { ...tab, url } : { ...tab, isActive: tab.id === activeTabId }
    );
    await window.stackpilot.workspace.persistTabs(activeWorkspace.id, updatedTabs);
    set({ activeWorkspace: { ...activeWorkspace, tabs: updatedTabs } });
  },
  openDevTools: async () => {
    await window.stackpilot.browser.openDevTools();
  },
  createWorkspace: async (input) => {
    await window.stackpilot.workspace.create({
      name: input.name,
      environmentType: input.environmentType,
      customEnvironmentLabel: input.customEnvironmentLabel,
      prodDomains: ['example.com']
    });
    await get().load();
  }
}));
