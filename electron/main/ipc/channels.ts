export const CHANNELS = {
  workspaceList: 'workspace:list',
  workspaceCreate: 'workspace:create',
  workspaceUpdate: 'workspace:update',
  workspaceDelete: 'workspace:delete',
  workspacePersistTabs: 'workspace:persist-tabs',
  browserNavigate: 'browser:navigate',
  browserOpenDevTools: 'browser:open-devtools',
  apiLogList: 'api-log:list',
  apiLogReceived: 'api-log:received',
  riskConfirmationRequested: 'risk:confirmation-requested',
  riskConfirmationRespond: 'risk:confirmation-respond'
} as const;
