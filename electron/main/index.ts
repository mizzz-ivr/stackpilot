import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { JsonRepository } from './persistence/jsonRepository';
import { WorkspaceService } from './services/workspaceService';
import { ApiLogService } from './services/apiLogService';
import { BrowserViewManager } from './services/browserViewManager';
import { registerHandlers } from './ipc/registerHandlers';
import type { SessionSnapshot } from '../../shared/domain/sessionRestore';

let mainWindow: BrowserWindow | null = null;
let workspaceService: WorkspaceService | null = null;

const createWindow = async (): Promise<void> => {
  const dataPath = join(app.getPath('userData'), 'workspace.snapshot.json');
  const repository = new JsonRepository<SessionSnapshot>(dataPath, () => ({ version: 2, workspaces: [] }));
  workspaceService = new WorkspaceService(repository);
  await workspaceService.init();

  const apiLogService = new ApiLogService();
  const browserViewManager = new BrowserViewManager(apiLogService);

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

  registerHandlers(mainWindow, workspaceService, browserViewManager, apiLogService);

  mainWindow.on('resize', () => browserViewManager.resize(mainWindow!));

  const rendererUrl = process.env.VITE_DEV_SERVER_URL ?? `file://${join(__dirname, '../../dist/index.html')}`;
  await mainWindow.loadURL(rendererUrl);
};

app.whenReady().then(createWindow);

app.on('before-quit', () => {
  void workspaceService?.persist();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
