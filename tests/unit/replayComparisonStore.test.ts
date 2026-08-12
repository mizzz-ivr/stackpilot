import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialInspectorState, type NetworkLog } from '../../shared/domain/inspector';
import { useAppStore } from '../../src/store/appStore';

const createLog = (id: string, url: string): NetworkLog => ({
  id,
  workspaceId: 'workspace-1',
  tabId: 'tab-1',
  resourceType: 'xhr',
  method: 'GET',
  url,
  status: 200,
  durationMs: 10,
  requestHeaders: {},
  responseHeaders: {},
  startedAt: 1_000
});

const sourceLog = createLog('source-log', 'https://api.example.test/users?trace=public');
const replayedLog = createLog('replayed-log', 'https://api.example.test/users?trace=edited');

beforeEach(() => {
  useAppStore.setState({
    activeWorkspaceId: 'workspace-1',
    inspector: createInitialInspectorState(),
    pendingReplayComparison: undefined,
    comparisonAutoOpenVersion: 0
  });
});

describe('Replay自動比較store', () => {
  it('元ログとReplayログが既にある場合は比較A/Bへ設定してauto-open versionを進める', () => {
    useAppStore.setState({
      inspector: {
        ...createInitialInspectorState(),
        logs: [replayedLog, sourceLog]
      }
    });

    useAppStore.getState().queueInspectorReplayComparison(sourceLog.id, replayedLog.id);

    const state = useAppStore.getState();
    expect(state.inspector.comparisonLogIds).toEqual([sourceLog.id, replayedLog.id]);
    expect(state.inspector.selectedLogId).toBe(replayedLog.id);
    expect(state.pendingReplayComparison).toBeUndefined();
    expect(state.comparisonAutoOpenVersion).toBe(1);
  });

  it('Replayログがまだ届いていない場合は比較要求をpendingへ保持する', () => {
    useAppStore.setState({
      inspector: {
        ...createInitialInspectorState(),
        logs: [sourceLog]
      }
    });

    useAppStore.getState().queueInspectorReplayComparison(sourceLog.id, replayedLog.id);

    const state = useAppStore.getState();
    expect(state.pendingReplayComparison).toEqual({
      sourceLogId: sourceLog.id,
      replayedLogId: replayedLog.id
    });
    expect(state.inspector.comparisonLogIds).toEqual([]);
    expect(state.comparisonAutoOpenVersion).toBe(0);
  });

  it('手動比較操作を行った場合はpendingのReplay比較要求を破棄する', () => {
    useAppStore.setState({
      inspector: {
        ...createInitialInspectorState(),
        logs: [sourceLog]
      }
    });
    useAppStore.getState().queueInspectorReplayComparison(sourceLog.id, replayedLog.id);

    useAppStore.getState().toggleInspectorComparison(sourceLog.id);

    const state = useAppStore.getState();
    expect(state.pendingReplayComparison).toBeUndefined();
    expect(state.inspector.comparisonLogIds).toEqual([sourceLog.id]);
  });
});