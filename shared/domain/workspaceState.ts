export interface WorkspaceSwitchState {
  activeWorkspaceId?: string;
  switchingWorkspaceId?: string;
}

export const createInitialWorkspaceSwitchState = (): WorkspaceSwitchState => ({
  activeWorkspaceId: undefined,
  switchingWorkspaceId: undefined
});

export const startWorkspaceSwitch = (
  state: WorkspaceSwitchState,
  workspaceId: string
): WorkspaceSwitchState => ({
  ...state,
  switchingWorkspaceId: workspaceId
});

export const completeWorkspaceSwitch = (
  state: WorkspaceSwitchState,
  workspaceId: string
): WorkspaceSwitchState => ({
  ...state,
  activeWorkspaceId: workspaceId,
  switchingWorkspaceId: undefined
});
