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
declare const resolveRisk: StackpilotIpcInvokeMethod<'risk:confirmation-respond'>;
declare const subscribeRisk: StackpilotIpcEventSubscriber<'risk:confirmation-requested'>;

const previewResult: Promise<ApiLogExportPreviewResult> = previewExport(previewRequest);
const saveResult: Promise<ApiLogExportSaveResult> = saveExport(saveRequest);
const discardResult: Promise<boolean> = discardExport(discardRequest);
const resolveResult: Promise<boolean> = resolveRisk('confirmation-1', true);
const unsubscribe = subscribeRisk((request) => {
  const confirmationId: string = request.confirmationId;
  const method: string = request.method;
  void confirmationId;
  void method;
});

void previewResult;
void saveResult;
void discardResult;
void resolveResult;
void unsubscribe;

// @ts-expect-error preview requestへsave requestは渡せない
previewExport(saveRequest);
// @ts-expect-error save requestへpreview requestは渡せない
saveExport(previewRequest);
// @ts-expect-error discard requestのpreviewIdは文字列が必要
void discardExport({ previewId: 123 });
// @ts-expect-error allowはbooleanが必要
void resolveRisk('confirmation-1', 'allow');
// @ts-expect-error event handlerのpayload型はRiskConfirmationRequest
subscribeRisk((request: number) => request);
