import { create } from 'zustand';
import type { ApiLogEntry, AppSnapshot, Workspace } from '../../shared/contracts';

interface AppState {
  snapshot?: AppSnapshot;
  activeWorkspace?: Workspace;
  activeTabId?: string;
  apiLogs: ApiLogEntry[];
  load: () => Promise<void>;
  selectWorkspace: (workspaceId: string) => Promise<void>;
  navigate: (url: string) => Promise<void>;
  openDevTools: () => Promise<void>;
  createWorkspace: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  apiLogs: [],
  load: async () => {
    const snapshot = await window.stackpilot.workspace.list();
    const activeWorkspace = snapshot.workspaces.find((w) => w.id === snapshot.activeWorkspaceId) ?? snapshot.workspaces[0];
    const activeTabId = activeWorkspace?.tabs.find((tab) => tab.isActive)?.id ?? activeWorkspace?.tabs[0]?.id;
    const apiLogs = activeWorkspace ? await window.stackpilot.apiLog.list(activeWorkspace.id) : [];
    set({ snapshot, activeWorkspace, activeTabId, apiLogs });
  },
  selectWorkspace: async (workspaceId) => {
    const snapshot = get().snapshot;
    if (!snapshot) return;
    const activeWorkspace = snapshot.workspaces.find((w) => w.id === workspaceId);
    if (!activeWorkspace) return;
    const activeTab = activeWorkspace.tabs.find((tab) => tab.isActive) ?? activeWorkspace.tabs[0];
    if (activeTab) {
      await window.stackpilot.browser.navigate(activeWorkspace, activeTab.id, activeTab.url);
    }
    const apiLogs = await window.stackpilot.apiLog.list(workspaceId);
    set({ activeWorkspace, activeTabId: activeTab?.id, apiLogs });
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
  createWorkspace: async () => {
    await window.stackpilot.workspace.create({
      name: `Workspace ${Date.now()}`,
      environment: 'dev',
      prodDomains: ['example.com']
    });
    await get().load();
  }
}));
