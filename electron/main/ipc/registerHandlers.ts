import { ipcMain, BrowserWindow } from 'electron';
import type { CreateWorkspaceInput, Workspace } from '../../../shared/contracts';
import type { StackpilotIpcEventPayload } from '../../../shared/domain/ipcPayloads';
import { CHANNELS } from './channels';
import { createTypedIpcHandler } from './typedIpc';
import { WorkspaceService } from '../services/workspaceService';
import { BrowserViewManager } from '../services/browserViewManager';
import { ApiLogService } from '../services/apiLogService';
import { ApiLogExportService } from '../services/apiLogExportService';
import { MobileInspectorServer } from '../services/mobileInspectorServer';

export interface RegisterHandlersOptions {
  disableBrowserNavigation?: boolean;
}

export const registerHandlers = (
  mainWindow: BrowserWindow,
  workspaceService: WorkspaceService,
  browserViewManager: BrowserViewManager,
  apiLogService: ApiLogService,
  mobileInspectorServer: MobileInspectorServer,
  options: RegisterHandlersOptions = {}
): void => {
  const pendingRiskConfirmations = new Map<string, (allow: boolean) => void>();
  const apiLogExportService = new ApiLogExportService(mainWindow, workspaceService, apiLogService);

  apiLogService.setConfirmRiskHandler(
    (request: StackpilotIpcEventPayload<typeof CHANNELS.riskConfirmationRequested>) => {
      if (mainWindow.isDestroyed()) return Promise.resolve(false);

      return new Promise<boolean>((resolve) => {
        pendingRiskConfirmations.set(request.confirmationId, resolve);
        mainWindow.webContents.send(CHANNELS.riskConfirmationRequested, request);
        setTimeout(() => {
          const resolver = pendingRiskConfirmations.get(request.confirmationId);
          if (!resolver) return;
          pendingRiskConfirmations.delete(request.confirmationId);
          resolver(false);
        }, 30_000);
      });
    }
  );

  ipcMain.handle(
    CHANNELS.riskConfirmationRespond,
    createTypedIpcHandler(
      CHANNELS.riskConfirmationRespond,
      (confirmationId, allow) => {
        const resolver = pendingRiskConfirmations.get(confirmationId);
        if (!resolver) return false;
        pendingRiskConfirmations.delete(confirmationId);
        resolver(Boolean(allow));
        return true;
      }
    )
  );

  ipcMain.handle(CHANNELS.workspaceList, () => workspaceService.getSnapshot());

  ipcMain.handle(CHANNELS.workspaceCreate, async (_event, input: CreateWorkspaceInput) => {
    return workspaceService.create(input);
  });

  ipcMain.handle(CHANNELS.workspaceUpdate, async (_event, workspaceId: string, patch: Partial<Workspace>) => {
    return workspaceService.update(workspaceId, patch);
  });

  ipcMain.handle(CHANNELS.workspaceDelete, async (_event, workspaceId: string) => {
    return workspaceService.remove(workspaceId);
  });

  ipcMain.handle(CHANNELS.workspacePersistTabs, async (_event, workspaceId: string, tabs: Workspace['tabs']) => {
    await workspaceService.persistTabs(workspaceId, tabs);
    return true;
  });

  ipcMain.handle(CHANNELS.workspaceSetActiveContext, async (_event, workspaceId?: string, tabId?: string) => {
    await workspaceService.setActiveContext(workspaceId, tabId);
    return true;
  });

  ipcMain.handle(CHANNELS.browserNavigate, async (_event, workspace: Workspace, tabId: string, url: string) => {
    if (options.disableBrowserNavigation) return true;
    browserViewManager.openTab(mainWindow, workspace, tabId, url);
    return true;
  });

  ipcMain.handle(CHANNELS.browserOpenDevTools, () => {
    if (options.disableBrowserNavigation) return false;
    browserViewManager.openDevTools();
    return true;
  });

  ipcMain.handle(CHANNELS.apiLogList, (_event, workspaceId: string) => apiLogService.list(workspaceId));
  ipcMain.handle(
    CHANNELS.apiLogExportPreview,
    createTypedIpcHandler(CHANNELS.apiLogExportPreview, (request) => apiLogExportService.preview(request))
  );
  ipcMain.handle(
    CHANNELS.apiLogExportSave,
    createTypedIpcHandler(CHANNELS.apiLogExportSave, (request) => apiLogExportService.save(request))
  );
  ipcMain.handle(
    CHANNELS.apiLogExportDiscard,
    createTypedIpcHandler(CHANNELS.apiLogExportDiscard, (request) => apiLogExportService.discard(request))
  );

  ipcMain.handle(
    CHANNELS.mobilePairingGetStatus,
    createTypedIpcHandler(CHANNELS.mobilePairingGetStatus, () => mobileInspectorServer.getStatus())
  );
  ipcMain.handle(
    CHANNELS.mobilePairingStart,
    createTypedIpcHandler(CHANNELS.mobilePairingStart, () => mobileInspectorServer.start())
  );
  ipcMain.handle(
    CHANNELS.mobilePairingStop,
    createTypedIpcHandler(CHANNELS.mobilePairingStop, () => mobileInspectorServer.stop())
  );

  mobileInspectorServer.onStatus(
    (status: StackpilotIpcEventPayload<typeof CHANNELS.mobilePairingStatusChanged>) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(CHANNELS.mobilePairingStatusChanged, status);
      }
    }
  );

  apiLogService.onLog(
    (entry: StackpilotIpcEventPayload<typeof CHANNELS.apiLogReceived>) => {
      mainWindow.webContents.send(CHANNELS.apiLogReceived, entry);
    }
  );
};
