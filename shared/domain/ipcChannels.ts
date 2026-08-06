// sandbox preloadではruntimeの共有module importを避ける必要があるため、
// main processとpreloadが個別に持つobject literalを型だけで同期する。
export type StackpilotIpcChannels = {
  readonly workspaceList: 'workspace:list';
  readonly workspaceCreate: 'workspace:create';
  readonly workspaceUpdate: 'workspace:update';
  readonly workspaceDelete: 'workspace:delete';
  readonly workspacePersistTabs: 'workspace:persist-tabs';
  readonly workspaceSetActiveContext: 'workspace:set-active-context';
  readonly browserNavigate: 'browser:navigate';
  readonly browserOpenDevTools: 'browser:open-devtools';
  readonly apiLogList: 'api-log:list';
  readonly apiLogExportPreview: 'api-log:export-preview';
  readonly apiLogExportSave: 'api-log:export-save';
  readonly apiLogExportDiscard: 'api-log:export-discard';
  readonly apiLogComparisonExport: 'api-log:comparison-export';
  readonly apiLogReceived: 'api-log:received';
  readonly riskConfirmationRequested: 'risk:confirmation-requested';
  readonly riskConfirmationRespond: 'risk:confirmation-respond';
  readonly mobilePairingGetStatus: 'mobile-pairing:get-status';
  readonly mobilePairingStart: 'mobile-pairing:start';
  readonly mobilePairingStop: 'mobile-pairing:stop';
  readonly mobilePairingStatusChanged: 'mobile-pairing:status-changed';
};

export type StackpilotIpcChannelUsage = 'invoke' | 'event';

// CIはこの定義をsource ASTとして読み取り、main/preloadの実利用と照合する。
// preloadからruntime importしないこと。
export const stackpilotIpcChannelUsages = {
  workspaceList: 'invoke',
  workspaceCreate: 'invoke',
  workspaceUpdate: 'invoke',
  workspaceDelete: 'invoke',
  workspacePersistTabs: 'invoke',
  workspaceSetActiveContext: 'invoke',
  browserNavigate: 'invoke',
  browserOpenDevTools: 'invoke',
  apiLogList: 'invoke',
  apiLogExportPreview: 'invoke',
  apiLogExportSave: 'invoke',
  apiLogExportDiscard: 'invoke',
  apiLogComparisonExport: 'invoke',
  apiLogReceived: 'event',
  riskConfirmationRequested: 'event',
  riskConfirmationRespond: 'invoke',
  mobilePairingGetStatus: 'invoke',
  mobilePairingStart: 'invoke',
  mobilePairingStop: 'invoke',
  mobilePairingStatusChanged: 'event'
} as const satisfies Record<keyof StackpilotIpcChannels, StackpilotIpcChannelUsage>;
