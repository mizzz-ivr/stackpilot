import { create } from 'zustand';
import type { ApiLogEntry, AppSnapshot, Workspace } from '../../shared/contracts';
import type { EnvironmentType } from '../../shared/domain/environment';
import {
  createInitialInspectorState,
  defaultInspectorFilter,
  filterLogs,
  findSelectedLog,
  toNetworkLog,
  type InspectorFilter,
  type InspectorMethodFilterKind,
  type InspectorState,
  type InspectorStatusFilterKind,
  type NetworkLog
} from '../../shared/domain/inspector';
import { completeWorkspaceSwitch, createInitialWorkspaceSwitchState, startWorkspaceSwitch } from '../../shared/domain/workspaceState';
import {
  createInitialRiskDialogState,
  openRiskDialog,
  resolveRiskDialog,
  type RiskDialogDecision,
  type RiskDialogState
} from '../../shared/domain/riskDialog';
import type { RiskConfirmationRequest } from '../../shared/domain/risk';

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
  riskDialog: RiskDialogState;
  load: () => Promise<void>;
  selectWorkspace: (workspaceId: string) => Promise<void>;
  navigate: (url: string) => Promise<void>;
  openDevTools: () => Promise<void>;
  setInspectorFilter: (kind: InspectorFilter['kind']) => void;
  setInspectorQuery: (query: string) => void;
  setInspectorMethodFilter: (method: InspectorMethodFilterKind) => void;
  setInspectorStatusFilter: (status: InspectorStatusFilterKind) => void;
  toggleInspectorPinnedOnly: () => void;
  resetInspectorFilters: () => void;
  toggleInspectorPin: (logId: string) => void;
  selectInspectorLog: (logId?: string) => void;
  createWorkspace: (input: CreateWorkspaceFormInput) => Promise<void>;
  requestRiskConfirmation: (request: RiskConfirmationRequest) => boolean;
  resolveRiskConfirmation: (decision: RiskDialogDecision) => RiskConfirmationRequest | undefined;
}

const maxInspectorLogs = 500;
let unsubscribeApiLog: undefined | (() => void);

const upsertInspectorLog = (
  logs: NetworkLog[],
  entry: ApiLogEntry,
  pinnedLogIds: string[]
): NetworkLog[] => {
  const next = toNetworkLog(entry);
  const existingIndex = logs.findIndex((log) => log.id === next.id);
  const nextLogs = existingIndex < 0
    ? [next, ...logs]
    : logs.map((log, index) => (index === existingIndex ? next : log));

  if (nextLogs.length <= maxInspectorLogs) return nextLogs;

  const pinnedIds = new Set(pinnedLogIds);
  const retainedIds = new Set<string>();
  for (const log of nextLogs) {
    if (pinnedIds.has(log.id) && retainedIds.size < maxInspectorLogs) retainedIds.add(log.id);
  }
  for (const log of nextLogs) {
    if (!pinnedIds.has(log.id) && retainedIds.size < maxInspectorLogs) retainedIds.add(log.id);
  }
  return nextLogs.filter((log) => retainedIds.has(log.id));
};

const applyInspectorFilter = (
  inspector: InspectorState,
  nextFilter: InspectorFilter
): InspectorState => {
  const visibleLogs = filterLogs(inspector.logs, nextFilter, inspector.pinnedLogIds);
  return {
    ...inspector,
    filter: nextFilter,
    selectedLogId:
      inspector.selectedLogId && visibleLogs.some((log) => log.id === inspector.selectedLogId)
        ? inspector.selectedLogId
        : undefined
  };
};

export const useAppStore = create<AppState>((set, get) => ({
  ...createInitialWorkspaceSwitchState(),
  inspector: createInitialInspectorState(),
  riskDialog: createInitialRiskDialogState(),
  load: async () => {
    set((state) => ({ inspector: { ...state.inspector, isLoading: true, errorMessage: undefined } }));

    try {
      const snapshot = await window.stackpilot.workspace.list();
      const activeWorkspace = snapshot.workspaces.find((w) => w.id === snapshot.activeWorkspaceId) ?? snapshot.workspaces[0];
      const activeTab =
        (snapshot.activeTabId ? activeWorkspace?.tabs.find((tab) => tab.id === snapshot.activeTabId) : undefined) ??
        activeWorkspace?.tabs.find((tab) => tab.isActive) ??
        activeWorkspace?.tabs[0];
      const logs = activeWorkspace ? await window.stackpilot.apiLog.list(activeWorkspace.id) : [];

      if (activeWorkspace && activeTab) {
        await window.stackpilot.browser.navigate(activeWorkspace, activeTab.id, activeTab.url);
        await window.stackpilot.workspace.setActiveContext(activeWorkspace.id, activeTab.id);
      }

      unsubscribeApiLog?.();
      unsubscribeApiLog = window.stackpilot.apiLog.subscribe((entry) => {
        const currentWorkspaceId = get().activeWorkspaceId;
        if (!currentWorkspaceId || entry.workspaceId !== currentWorkspaceId) return;
        set((state) => ({
          inspector: {
            ...state.inspector,
            logs: upsertInspectorLog(state.inspector.logs, entry, state.inspector.pinnedLogIds)
          }
        }));
      });

      set({
        snapshot,
        activeWorkspace,
        activeWorkspaceId: activeWorkspace?.id,
        activeTabId: activeTab?.id,
        inspector: {
          ...get().inspector,
          logs: logs.map(toNetworkLog),
          filter: { ...defaultInspectorFilter },
          pinnedLogIds: [],
          selectedLogId: undefined,
          isLoading: false,
          errorMessage: undefined
        },
        switchingWorkspaceId: undefined
      });
    } catch {
      set((state) => ({ inspector: { ...state.inspector, isLoading: false, errorMessage: 'ログ取得に失敗しました。' } }));
    }
  },
  selectWorkspace: async (workspaceId) => {
    const snapshot = get().snapshot;
    if (!snapshot) return;
    const targetWorkspace = snapshot.workspaces.find((w) => w.id === workspaceId);
    if (!targetWorkspace) return;

    set((state) => ({
      ...startWorkspaceSwitch(state, workspaceId),
      inspector: {
        ...state.inspector,
        filter: { ...defaultInspectorFilter },
        pinnedLogIds: [],
        selectedLogId: undefined,
        isLoading: true,
        errorMessage: undefined
      }
    }));

    const activeTab = targetWorkspace.tabs.find((tab) => tab.isActive) ?? targetWorkspace.tabs[0];
    if (activeTab) {
      await window.stackpilot.browser.navigate(targetWorkspace, activeTab.id, activeTab.url);
      await window.stackpilot.workspace.setActiveContext(targetWorkspace.id, activeTab.id);
    }

    try {
      const logs = await window.stackpilot.apiLog.list(workspaceId);
      set((state) => ({
        ...completeWorkspaceSwitch(state, workspaceId),
        activeWorkspace: targetWorkspace,
        activeTabId: activeTab?.id,
        inspector: {
          ...state.inspector,
          logs: logs.map(toNetworkLog),
          filter: { ...defaultInspectorFilter },
          pinnedLogIds: [],
          selectedLogId: undefined,
          isLoading: false,
          errorMessage: undefined
        }
      }));
    } catch {
      set((state) => ({
        ...completeWorkspaceSwitch(state, workspaceId),
        activeWorkspace: targetWorkspace,
        activeTabId: activeTab?.id,
        inspector: {
          ...state.inspector,
          logs: [],
          filter: { ...defaultInspectorFilter },
          pinnedLogIds: [],
          selectedLogId: undefined,
          isLoading: false,
          errorMessage: 'ログ取得に失敗しました。'
        }
      }));
    }
  },
  navigate: async (url) => {
    const { activeWorkspace, activeTabId } = get();
    if (!activeWorkspace || !activeTabId) return;
    await window.stackpilot.browser.navigate(activeWorkspace, activeTabId, url);
    const updatedTabs = activeWorkspace.tabs.map((tab) =>
      tab.id === activeTabId ? { ...tab, url, workspaceId: activeWorkspace.id, isActive: true } : { ...tab, workspaceId: activeWorkspace.id, isActive: false }
    );
    await window.stackpilot.workspace.persistTabs(activeWorkspace.id, updatedTabs);
    await window.stackpilot.workspace.setActiveContext(activeWorkspace.id, activeTabId);
    const snapshot = get().snapshot;
    set({
      snapshot: snapshot
        ? {
            ...snapshot,
            activeWorkspaceId: activeWorkspace.id,
            activeTabId,
            workspaces: snapshot.workspaces.map((workspace) => (workspace.id === activeWorkspace.id ? { ...workspace, tabs: updatedTabs } : workspace))
          }
        : snapshot,
      activeWorkspace: { ...activeWorkspace, tabs: updatedTabs }
    });
  },
  openDevTools: async () => {
    await window.stackpilot.browser.openDevTools();
  },
  setInspectorFilter: (kind) => {
    set((state) => ({
      inspector: applyInspectorFilter(state.inspector, { ...state.inspector.filter, kind })
    }));
  },
  setInspectorQuery: (query) => {
    set((state) => ({
      inspector: applyInspectorFilter(state.inspector, { ...state.inspector.filter, query })
    }));
  },
  setInspectorMethodFilter: (method) => {
    set((state) => ({
      inspector: applyInspectorFilter(state.inspector, { ...state.inspector.filter, method })
    }));
  },
  setInspectorStatusFilter: (status) => {
    set((state) => ({
      inspector: applyInspectorFilter(state.inspector, { ...state.inspector.filter, status })
    }));
  },
  toggleInspectorPinnedOnly: () => {
    set((state) => ({
      inspector: applyInspectorFilter(state.inspector, {
        ...state.inspector.filter,
        pinnedOnly: !state.inspector.filter.pinnedOnly
      })
    }));
  },
  resetInspectorFilters: () => {
    set((state) => ({
      inspector: applyInspectorFilter(state.inspector, { ...defaultInspectorFilter })
    }));
  },
  toggleInspectorPin: (logId) => {
    set((state) => {
      if (!state.inspector.logs.some((log) => log.id === logId)) return state;
      const isPinned = state.inspector.pinnedLogIds.includes(logId);
      const pinnedLogIds = isPinned
        ? state.inspector.pinnedLogIds.filter((id) => id !== logId)
        : [...state.inspector.pinnedLogIds, logId];
      const nextInspector = { ...state.inspector, pinnedLogIds };
      return {
        inspector: applyInspectorFilter(nextInspector, nextInspector.filter)
      };
    });
  },
  selectInspectorLog: (logId) => {
    set((state) => ({
      inspector: {
        ...state.inspector,
        selectedLogId: logId && state.inspector.logs.some((log) => log.id === logId) ? logId : undefined
      }
    }));
  },
  createWorkspace: async (input) => {
    await window.stackpilot.workspace.create({
      name: input.name,
      environmentType: input.environmentType,
      customEnvironmentLabel: input.customEnvironmentLabel,
      prodDomains: ['example.com']
    });
    await get().load();
  },
  requestRiskConfirmation: (request) => {
    let opened = false;
    set((state) => {
      const next = openRiskDialog(state.riskDialog, request);
      opened = next.isOpen && next.currentRequest?.confirmationId === request.confirmationId;
      return { riskDialog: next };
    });
    return opened;
  },
  resolveRiskConfirmation: (decision) => {
    const currentRequest = get().riskDialog.currentRequest;
    if (!currentRequest) return undefined;
    set((state) => ({ riskDialog: resolveRiskDialog(state.riskDialog, decision) }));
    return currentRequest;
  }
}));

export const selectFilteredLogs = (state: AppState) =>
  filterLogs(state.inspector.logs, state.inspector.filter, state.inspector.pinnedLogIds);
export const selectSelectedLog = (state: AppState) =>
  findSelectedLog(state.inspector.logs, state.inspector.selectedLogId);
