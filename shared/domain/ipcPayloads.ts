import type {
  ApiLogExportDiscardRequest,
  ApiLogExportPreviewRequest,
  ApiLogExportPreviewResult,
  ApiLogExportSaveRequest,
  ApiLogExportSaveResult
} from './apiLogExportPreview';
import type { StackpilotIpcChannels } from './ipcChannels';
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
  'risk:confirmation-respond': IpcInvokeDefinition<
    [confirmationId: string, allow: boolean],
    boolean
  >;
}>;

export type StackpilotCriticalIpcEventContract = DefineIpcEventContract<{
  'risk:confirmation-requested': IpcEventDefinition<RiskConfirmationRequest>;
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
