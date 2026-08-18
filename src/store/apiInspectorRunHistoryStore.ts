import { create } from 'zustand';
import {
  appendApiInspectorRunHistory,
  clearApiInspectorRunHistory,
  type ApiInspectorRunHistoryEntry
} from '../../shared/domain/apiInspectorRunHistory';

export type ApiInspectorRunHistoryDraft = Omit<ApiInspectorRunHistoryEntry, 'id'>;

interface ApiInspectorRunHistoryState {
  history: ApiInspectorRunHistoryEntry[];
  recordRun: (entry: ApiInspectorRunHistoryDraft) => void;
  clearWorkspace: (workspaceId: string) => void;
}

let historyEntrySequence = 0;

export const useApiInspectorRunHistoryStore = create<ApiInspectorRunHistoryState>((set) => ({
  history: [],
  recordRun: (entry) => {
    const id = `${entry.workspaceId}:${entry.sourceLogId}:${entry.executedAt}:${historyEntrySequence++}`;
    set((state) => ({
      history: appendApiInspectorRunHistory(state.history, { ...entry, id })
    }));
  },
  clearWorkspace: (workspaceId) => {
    set((state) => ({
      history: clearApiInspectorRunHistory(state.history, workspaceId)
    }));
  }
}));
