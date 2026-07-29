import type { IpcMainInvokeEvent } from 'electron';
import type {
  StackpilotCriticalInvokeChannel,
  StackpilotIpcInvokeArgs,
  StackpilotIpcInvokeResult
} from '../../../shared/domain/ipcPayloads';

type MaybePromise<Value> = Value | Promise<Value>;

type ElectronIpcHandler = (
  event: IpcMainInvokeEvent,
  ...args: unknown[]
) => MaybePromise<unknown>;

export const createTypedIpcHandler = <Channel extends StackpilotCriticalInvokeChannel>(
  channel: Channel,
  handler: (
    ...args: StackpilotIpcInvokeArgs<Channel>
  ) => MaybePromise<StackpilotIpcInvokeResult<Channel>>
): ElectronIpcHandler => {
  void channel;
  return (_event, ...args) =>
    handler(...(args as unknown as StackpilotIpcInvokeArgs<Channel>));
};
