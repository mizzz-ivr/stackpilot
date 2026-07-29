import { ipcMain, type WebContents } from 'electron';
import type {
  StackpilotCriticalEventChannel,
  StackpilotCriticalInvokeChannel,
  StackpilotIpcEventPayload,
  StackpilotIpcInvokeArgs,
  StackpilotIpcInvokeResult
} from '../../../shared/domain/ipcPayloads';

type MaybePromise<Value> = Value | Promise<Value>;

export const handleTypedIpc = <Channel extends StackpilotCriticalInvokeChannel>(
  channel: Channel,
  handler: (
    ...args: StackpilotIpcInvokeArgs<Channel>
  ) => MaybePromise<StackpilotIpcInvokeResult<Channel>>
): void => {
  ipcMain.handle(channel, (_event, ...args: unknown[]) =>
    handler(...(args as unknown as StackpilotIpcInvokeArgs<Channel>))
  );
};

export const sendTypedIpcEvent = <Channel extends StackpilotCriticalEventChannel>(
  webContents: Pick<WebContents, 'send'>,
  channel: Channel,
  payload: StackpilotIpcEventPayload<Channel>
): void => {
  webContents.send(channel, payload);
};
