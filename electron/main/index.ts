import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { JsonRepository } from './persistence/jsonRepository';
import { WorkspaceService } from './services/workspaceService';
import { ApiLogService } from './services/apiLogService';
import { BrowserViewManager } from './services/browserViewManager';
import { MobileInspectorServer } from './services/mobileInspectorServer';
import { registerHandlers } from './ipc/registerHandlers';
import type { SessionSnapshot } from '../../shared/domain/sessionRestore';
import {
  createStackpilotE2eSessionSnapshot,
  isStackpilotE2eMode,
  seedStackpilotE2eApiLog,
  stackpilotE2eWorkspaceId
} from './e2e/fixture';

let mainWindow: BrowserWindow | null = null;
let workspaceService: WorkspaceService | null = null;
let mobileInspectorServer: MobileInspectorServer | null = null;

const e2eMode = isStackpilotE2eMode();
const e2eUserDataDir = process.env.STACKPILOT_E2E_USER_DATA_DIR;
if (e2eMode && e2eUserDataDir) {
  app.setPath('userData', e2eUserDataDir);
}

const createWindow = async (): Promise<void> => {
  const dataPath = join(app.getPath('userData'), 'workspace.snapshot.json');
  const repository = new JsonRepository<SessionSnapshot>(dataPath, () =>
    e2eMode ? createStackpilotE2eSessionSnapshot() : { version: 2, workspaces: [] }
  );
  workspaceService = new WorkspaceService(repository);
  await workspaceService.init();

  const apiLogService = new ApiLogService();
  if (e2eMode) {
    const workspace = workspaceService
      .getSnapshot()
      .workspaces.find((item) => item.id === stackpilotE2eWorkspaceId);
    if (!workspace) {
      throw new Error('Electron E2E用Workspaceを初期化できませんでした。');
    }
    await seedStackpilotE2eApiLog(apiLogService, workspace);
  }

  const browserViewManager = new BrowserViewManager(apiLogService);
  mobileInspectorServer = new MobileInspectorServer({
    getSnapshot: () => workspaceService!.getSnapshot(),
    listLogs: (workspaceId) => apiLogService.list(workspaceId)
  });

  mainWindow = new BrowserWindow({
    width: 1480,
    height: 960,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  registerHandlers(mainWindow, workspaceService, browserViewManager, apiLogService, mobileInspectorServer, {
    disableBrowserNavigation: e2eMode
  });

  mainWindow.on('resize', () => browserViewManager.resize(mainWindow!));

  const rendererUrl = process.env.VITE_DEV_SERVER_URL ?? `file://${join(__dirname, '../../dist/index.html')}`;
  await mainWindow.loadURL(rendererUrl);
};

app.whenReady().then(createWindow);

app.on('before-quit', () => {
  void workspaceService?.persist();
  void mobileInspectorServer?.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
