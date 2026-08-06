import type { StackpilotIpcChannels } from '../../../shared/domain/ipcChannels';

export const CHANNELS = {
  workspaceList: 'workspace:list',
  workspaceCreate: 'workspace:create',
  workspaceUpdate: 'workspace:update',
  workspaceDelete: 'workspace:delete',
  workspacePersistTabs: 'workspace:persist-tabs',
  workspaceSetActiveContext: 'workspace:set-active-context',
  browserNavigate: 'browser:navigate',
  browserOpenDevTools: 'browser:open-devtools',
  apiLogList: 'api-log:list',
  apiLogExportPreview: 'api-log:export-preview',
  apiLogExportSave: 'api-log:export-save',
  apiLogExportDiscard: 'api-log:export-discard',
  apiLogComparisonExport: 'api-log:comparison-export',
  apiLogReceived: 'api-log:received',
  riskConfirmationRequested: 'risk:confirmation-requested',
  riskConfirmationRespond: 'risk:confirmation-respond',
  mobilePairingGetStatus: 'mobile-pairing:get-status',
  mobilePairingStart: 'mobile-pairing:start',
  mobilePairingStop: 'mobile-pairing:stop',
  mobilePairingStatusChanged: 'mobile-pairing:status-changed'
} as const satisfies StackpilotIpcChannels;
