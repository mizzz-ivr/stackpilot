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
  readonly apiLogReceived: 'api-log:received';
  readonly riskConfirmationRequested: 'risk:confirmation-requested';
  readonly riskConfirmationRespond: 'risk:confirmation-respond';
  readonly mobilePairingGetStatus: 'mobile-pairing:get-status';
  readonly mobilePairingStart: 'mobile-pairing:start';
  readonly mobilePairingStop: 'mobile-pairing:stop';
  readonly mobilePairingStatusChanged: 'mobile-pairing:status-changed';
};
