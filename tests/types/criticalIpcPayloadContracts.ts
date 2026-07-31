import type { ApiLogEntry } from '../../shared/contracts';
import type {
  ApiLogExportDiscardRequest,
  ApiLogExportPreviewRequest,
  ApiLogExportPreviewResult,
  ApiLogExportSaveRequest,
  ApiLogExportSaveResult
} from '../../shared/domain/apiLogExportPreview';
import type {
  StackpilotIpcEventSubscriber,
  StackpilotIpcInvokeMethod
} from '../../shared/domain/ipcPayloads';
import type { MobilePairingServerStatus } from '../../shared/domain/mobilePairing';

const previewRequest: ApiLogExportPreviewRequest = {
  workspaceId: 'workspace-1',
  format: 'json',
  filterKind: 'all'
};
const saveRequest: ApiLogExportSaveRequest = { previewId: 'preview-1' };
const discardRequest: ApiLogExportDiscardRequest = { previewId: 'preview-1' };

declare const previewExport: StackpilotIpcInvokeMethod<'api-log:export-preview'>;
declare const saveExport: StackpilotIpcInvokeMethod<'api-log:export-save'>;
declare const discardExport: StackpilotIpcInvokeMethod<'api-log:export-discard'>;
declare const subscribeApiLog: StackpilotIpcEventSubscriber<'api-log:received'>;
declare const resolveRisk: StackpilotIpcInvokeMethod<'risk:confirmation-respond'>;
declare const subscribeRisk: StackpilotIpcEventSubscriber<'risk:confirmation-requested'>;
declare const getMobilePairingStatus: StackpilotIpcInvokeMethod<'mobile-pairing:get-status'>;
declare const startMobilePairing: StackpilotIpcInvokeMethod<'mobile-pairing:start'>;
declare const stopMobilePairing: StackpilotIpcInvokeMethod<'mobile-pairing:stop'>;
declare const subscribeMobilePairingStatus: StackpilotIpcEventSubscriber<'mobile-pairing:status-changed'>;

const previewResult: Promise<ApiLogExportPreviewResult> = previewExport(previewRequest);
const saveResult: Promise<ApiLogExportSaveResult> = saveExport(saveRequest);
const discardResult: Promise<boolean> = discardExport(discardRequest);
const resolveResult: Promise<boolean> = resolveRisk('confirmation-1', true);
const mobilePairingStatusResult: Promise<MobilePairingServerStatus> = getMobilePairingStatus();
const mobilePairingStartResult: Promise<MobilePairingServerStatus> = startMobilePairing();
const mobilePairingStopResult: Promise<MobilePairingServerStatus> = stopMobilePairing();
const unsubscribeApiLog = subscribeApiLog((entry) => {
  const id: ApiLogEntry['id'] = entry.id;
  const method: ApiLogEntry['method'] = entry.method;
  const url: ApiLogEntry['url'] = entry.url;
  void id;
  void method;
  void url;
});
const unsubscribeRisk = subscribeRisk((request) => {
  const confirmationId: string = request.confirmationId;
  const method: string = request.method;
  void confirmationId;
  void method;
});
const unsubscribeMobilePairing = subscribeMobilePairingStatus((status) => {
  const state: MobilePairingServerStatus['state'] = status.state;
  const pairingUri: string | undefined = status.pairingUri;
  void state;
  void pairingUri;
});

void previewResult;
void saveResult;
void discardResult;
void resolveResult;
void mobilePairingStatusResult;
void mobilePairingStartResult;
void mobilePairingStopResult;
void unsubscribeApiLog;
void unsubscribeRisk;
void unsubscribeMobilePairing;

// @ts-expect-error preview requestへsave requestは渡せない
previewExport(saveRequest);
// @ts-expect-error save requestへpreview requestは渡せない
saveExport(previewRequest);
// @ts-expect-error discard requestのpreviewIdは文字列が必要
void discardExport({ previewId: 123 });
// @ts-expect-error event handlerのpayload型はApiLogEntry
subscribeApiLog((entry: string) => entry);
// @ts-expect-error allowはbooleanが必要
void resolveRisk('confirmation-1', 'allow');
// @ts-expect-error event handlerのpayload型はRiskConfirmationRequest
subscribeRisk((request: number) => request);
// @ts-expect-error getStatusは引数を受け取らない
void getMobilePairingStatus('workspace-1');
// @ts-expect-error startは引数を受け取らない
void startMobilePairing(true);
// @ts-expect-error stopは引数を受け取らない
void stopMobilePairing({ force: true });
// @ts-expect-error event handlerのpayload型はMobilePairingServerStatus
subscribeMobilePairingStatus((status: string) => status);
