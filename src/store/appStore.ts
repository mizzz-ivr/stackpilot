import { create } from 'zustand';
import type { AppSnapshot, Workspace } from '../../shared/contracts';
import type { EnvironmentType } from '../../shared/domain/environment';
import {
  createInitialInspectorState,
  defaultInspectorFilter,
  filterLogs,
  toNetworkLog,
  type InspectorFilter,
  type InspectorState
} from '../../shared/domain/inspector';
import { resolveWorkspaceActiveTabId } from '../../shared/domain/workspace';
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
  inspector: InspectorState;
  load: () => Promise<void>;
  selectWorkspace: (workspaceId: string) => Promise<void>;
  navigate: (url: string) => Promise<void>;
  openDevTools: () => Promise<void>;
  setInspectorFilter: (kind: InspectorFilter['kind']) => void;
  createWorkspace: (input: CreateWorkspaceFormInput) => Promise<void>;
}

let unsubscribeApiLog: undefined | (() => void);

const resolveActiveWorkspace = (snapshot: AppSnapshot): Workspace | undefined => {
  if (!snapshot.activeWorkspaceId) return snapshot.workspaces[0];
  return snapshot.workspaces.find((workspace) => workspace.id === snapshot.activeWorkspaceId) ?? snapshot.workspaces[0];
};

const syncSnapshotState = (snapshot: AppSnapshot) => {
  const activeWorkspace = resolveActiveWorkspace(snapshot);
  const activeTabId = activeWorkspace
    ? snapshot.activeTabId && activeWorkspace.tabs.some((tab) => tab.id === snapshot.activeTabId)
      ? snapshot.activeTabId
      : resolveWorkspaceActiveTabId(activeWorkspace)
    : undefined;

  return { snapshot, activeWorkspace, activeWorkspaceId: activeWorkspace?.id, activeTabId };
};

export const useAppStore = create<AppState>((set, get) => ({
  ...createInitialWorkspaceSwitchState(),
  inspector: createInitialInspectorState(),
  load: async () => {
    set((state) => ({ inspector: { ...state.inspector, isLoading: true, errorMessage: undefined } }));

    try {
      const snapshot = await window.stackpilot.workspace.list();
      const { activeWorkspace, activeWorkspaceId, activeTabId } = syncSnapshotState(snapshot);
      const logs = activeWorkspace ? await window.stackpilot.apiLog.list(activeWorkspace.id) : [];

      unsubscribeApiLog?.();
      unsubscribeApiLog = window.stackpilot.apiLog.subscribe((entry) => {
        const currentWorkspaceId = get().activeWorkspaceId;
        if (!currentWorkspaceId || entry.workspaceId !== currentWorkspaceId) return;
        set((state) => ({
          inspector: {
            ...state.inspector,
            logs: [toNetworkLog(entry), ...state.inspector.logs].slice(0, 500)
          }
        }));
      });

      set({
        snapshot,
        activeWorkspace,
        activeWorkspaceId,
        activeTabId,
        inspector: {
          ...get().inspector,
          logs: logs.map(toNetworkLog),
          isLoading: false,
          errorMessage: undefined,
          filter: defaultInspectorFilter
        },
        switchingWorkspaceId: undefined
      });

      if (activeWorkspace && activeTabId) {
        const activeTab = activeWorkspace.tabs.find((tab) => tab.id === activeTabId);
        if (activeTab) {
          await window.stackpilot.browser.navigate(activeWorkspace, activeTabId, activeTab.url);
        }
      }
    } catch {
      set((state) => ({ inspector: { ...state.inspector, isLoading: false, errorMessage: 'ログ取得に失敗しました。' } }));
    }
  },
  selectWorkspace: async (workspaceId) => {
    const snapshot = get().snapshot;
    if (!snapshot) return;
    const targetWorkspace = snapshot.workspaces.find((w) => w.id === workspaceId);
    if (!targetWorkspace) return;

    set((state) => ({ ...startWorkspaceSwitch(state, workspaceId), inspector: { ...state.inspector, isLoading: true, errorMessage: undefined } }));

    const switchedSnapshot = await window.stackpilot.workspace.switch(workspaceId);
    const { activeWorkspace, activeTabId } = syncSnapshotState(switchedSnapshot);
    const activeTab = activeWorkspace?.tabs.find((tab) => tab.id === activeTabId);

    if (activeWorkspace && activeTab && activeTabId) {
      await window.stackpilot.browser.navigate(activeWorkspace, activeTabId, activeTab.url);
    }

    try {
      const logs = await window.stackpilot.apiLog.list(workspaceId);
      set((state) => ({
        ...completeWorkspaceSwitch(state, workspaceId),
        ...syncSnapshotState(switchedSnapshot),
        inspector: {
          ...state.inspector,
          logs: logs.map(toNetworkLog),
          isLoading: false,
          errorMessage: undefined
        }
      }));
    } catch {
      set((state) => ({
        ...completeWorkspaceSwitch(state, workspaceId),
        ...syncSnapshotState(switchedSnapshot),
        inspector: { ...state.inspector, logs: [], isLoading: false, errorMessage: 'ログ取得に失敗しました。' }
      }));
    }
  },
  navigate: async (url) => {
    const { activeWorkspace, activeTabId, snapshot } = get();
    if (!activeWorkspace || !activeTabId || !snapshot) return;
    await window.stackpilot.browser.navigate(activeWorkspace, activeTabId, url);

    const updatedTabs = activeWorkspace.tabs.map((tab) =>
      tab.id === activeTabId ? { ...tab, url, isActive: true } : { ...tab, isActive: false }
    );

    const nextSnapshot = await window.stackpilot.workspace.activateTab(activeWorkspace.id, activeTabId);
    await window.stackpilot.workspace.persistTabs(activeWorkspace.id, updatedTabs);

    const mergedSnapshot: AppSnapshot = {
      ...nextSnapshot,
      workspaces: nextSnapshot.workspaces.map((workspace) =>
        workspace.id === activeWorkspace.id ? { ...workspace, tabs: updatedTabs } : workspace
      )
    };

    set({ ...syncSnapshotState(mergedSnapshot) });
  },
  openDevTools: async () => {
    await window.stackpilot.browser.openDevTools();
  },
  setInspectorFilter: (kind) => {
    set((state) => ({ inspector: { ...state.inspector, filter: { kind } } }));
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

export const selectFilteredLogs = (state: AppState) => filterLogs(state.inspector.logs, state.inspector.filter);
