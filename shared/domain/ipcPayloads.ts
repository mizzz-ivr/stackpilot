import type {
  ApiLogExportDiscardRequest,
  ApiLogExportPreviewRequest,
  ApiLogExportPreviewResult,
  ApiLogExportSaveRequest,
  ApiLogExportSaveResult
} from './apiLogExportPreview';
import type {
  ApiLogComparisonExportRequest,
  ApiLogComparisonExportResult
} from './apiLogComparisonExport';
import type { ApiLogEntry } from '../contracts';
import type { StackpilotIpcChannels } from './ipcChannels';
import type { MobilePairingServerStatus } from './mobilePairing';
import type { RiskConfirmationRequest } from './risk';

type StackpilotIpcChannelValue = StackpilotIpcChannels[keyof StackpilotIpcChannels];

type IpcInvokeDefinition<Args extends unknown[], Result> = {
  readonly args: Args;
  readonly result: Result;
};

type IpcEventDefinition<Payload> = {
  readonly payload: Payload;
};

type DefineIpcInvokeContract<
  Contract extends Partial<Record<StackpilotIpcChannelValue, IpcInvokeDefinition<unknown[], unknown>>>
> = Contract;

type DefineIpcEventContract<
  Contract extends Partial<Record<StackpilotIpcChannelValue, IpcEventDefinition<unknown>>>
> = Contract;

export type StackpilotCriticalIpcInvokeContract = DefineIpcInvokeContract<{
  'api-log:export-preview': IpcInvokeDefinition<
    [request: ApiLogExportPreviewRequest],
    ApiLogExportPreviewResult
  >;
  'api-log:export-save': IpcInvokeDefinition<
    [request: ApiLogExportSaveRequest],
    ApiLogExportSaveResult
  >;
  'api-log:export-discard': IpcInvokeDefinition<
    [request: ApiLogExportDiscardRequest],
    boolean
  >;
  'api-log:comparison-export': IpcInvokeDefinition<
    [request: ApiLogComparisonExportRequest],
    ApiLogComparisonExportResult
  >;
  'risk:confirmation-respond': IpcInvokeDefinition<
    [confirmationId: string, allow: boolean],
    boolean
  >;
  'mobile-pairing:get-status': IpcInvokeDefinition<[], MobilePairingServerStatus>;
  'mobile-pairing:start': IpcInvokeDefinition<[], MobilePairingServerStatus>;
  'mobile-pairing:stop': IpcInvokeDefinition<[], MobilePairingServerStatus>;
}>;

export type StackpilotCriticalIpcEventContract = DefineIpcEventContract<{
  'api-log:received': IpcEventDefinition<ApiLogEntry>;
  'risk:confirmation-requested': IpcEventDefinition<RiskConfirmationRequest>;
  'mobile-pairing:status-changed': IpcEventDefinition<MobilePairingServerStatus>;
}>;

export type StackpilotCriticalInvokeChannel = keyof StackpilotCriticalIpcInvokeContract;
export type StackpilotCriticalEventChannel = keyof StackpilotCriticalIpcEventContract;

export type StackpilotIpcInvokeArgs<Channel extends StackpilotCriticalInvokeChannel> =
  StackpilotCriticalIpcInvokeContract[Channel]['args'];

export type StackpilotIpcInvokeResult<Channel extends StackpilotCriticalInvokeChannel> =
  StackpilotCriticalIpcInvokeContract[Channel]['result'];

export type StackpilotIpcEventPayload<Channel extends StackpilotCriticalEventChannel> =
  StackpilotCriticalIpcEventContract[Channel]['payload'];

export type StackpilotIpcInvokeMethod<Channel extends StackpilotCriticalInvokeChannel> = (
  ...args: StackpilotIpcInvokeArgs<Channel>
) => Promise<StackpilotIpcInvokeResult<Channel>>;

export type StackpilotIpcEventSubscriber<Channel extends StackpilotCriticalEventChannel> = (
  handler: (payload: StackpilotIpcEventPayload<Channel>) => void
) => () => void;
