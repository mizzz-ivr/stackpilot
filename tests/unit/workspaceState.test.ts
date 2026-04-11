import { describe, expect, it } from 'vitest';
import {
  completeWorkspaceSwitch,
  createInitialWorkspaceSwitchState,
  startWorkspaceSwitch
} from '../../shared/domain/workspaceState';

describe('workspace switch state', () => {
  it('初期状態は active/switching が未設定', () => {
    expect(createInitialWorkspaceSwitchState()).toEqual({
      activeWorkspaceId: undefined,
      switchingWorkspaceId: undefined
    });
  });

  it('切替開始で switchingWorkspaceId が設定される', () => {
    const next = startWorkspaceSwitch(createInitialWorkspaceSwitchState(), 'w1');
    expect(next.switchingWorkspaceId).toBe('w1');
    expect(next.activeWorkspaceId).toBeUndefined();
  });

  it('切替完了で activeWorkspaceId が更新され switching が解除される', () => {
    const switching = startWorkspaceSwitch(createInitialWorkspaceSwitchState(), 'w2');
    const done = completeWorkspaceSwitch(switching, 'w2');
    expect(done.activeWorkspaceId).toBe('w2');
    expect(done.switchingWorkspaceId).toBeUndefined();
  });
});
