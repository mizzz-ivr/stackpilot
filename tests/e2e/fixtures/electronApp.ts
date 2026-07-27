import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  _electron as electron,
  expect,
  test as base,
  type ElectronApplication,
  type Page,
  type TestInfo
} from '@playwright/test';

export interface ElectronE2ePaths {
  rootDir: string;
  userDataDir: string;
  exportFile: string;
}

type ElectronE2eFixtures = {
  electronApp: ElectronApplication;
  appWindow: Page;
  e2ePaths: ElectronE2ePaths;
};

export const test = base.extend<ElectronE2eFixtures>({
  e2ePaths: async ({}, use) => {
    const rootDir = await mkdtemp(join(tmpdir(), 'stackpilot-e2e-'));
    const userDataDir = join(rootDir, 'user-data');
    const exportFile = join(rootDir, 'api-log-export.json');
    await mkdir(userDataDir, { recursive: true });

    await use({ rootDir, userDataDir, exportFile });
    await rm(rootDir, { recursive: true, force: true });
  },

  electronApp: async ({ e2ePaths }, use) => {
    const electronApp = await electron.launch({
      args: [resolve('dist-electron/electron/main/index.js')],
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
        STACKPILOT_E2E: '1',
        STACKPILOT_E2E_USER_DATA_DIR: e2ePaths.userDataDir
      }
    });

    await electronApp.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = (() => Promise.resolve({ canceled: false, filePath })) as typeof dialog.showSaveDialog;
    }, e2ePaths.exportFile);

    await use(electronApp);
    await electronApp.close();
  },

  appWindow: async ({ electronApp }, use, testInfo) => {
    const appWindow = await electronApp.firstWindow();
    const rendererErrors: string[] = [];
    const context = electronApp.context();

    appWindow.on('console', (message) => {
      if (message.type() === 'error') rendererErrors.push(message.text());
    });
    appWindow.on('pageerror', (error) => rendererErrors.push(error.message));

    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    await use(appWindow);
    await collectFailureEvidence(appWindow, context, testInfo);

    expect(rendererErrors, `rendererでconsole errorが発生しました:\n${rendererErrors.join('\n')}`).toEqual([]);
  }
});

export { expect } from '@playwright/test';

export const readSavedExport = async (paths: ElectronE2ePaths): Promise<{
  content: string;
  sha256: string;
}> => {
  const content = await readFile(paths.exportFile, 'utf8');
  return {
    content,
    sha256: createHash('sha256').update(content).digest('hex')
  };
};

const collectFailureEvidence = async (
  appWindow: Page,
  context: ReturnType<ElectronApplication['context']>,
  testInfo: TestInfo
): Promise<void> => {
  if (testInfo.status === testInfo.expectedStatus) {
    await context.tracing.stop();
    return;
  }

  const screenshotPath = testInfo.outputPath('electron-failure.png');
  const tracePath = testInfo.outputPath('electron-trace.zip');

  try {
    await appWindow.screenshot({ path: screenshotPath, fullPage: false });
    await testInfo.attach('electron-failure', { path: screenshotPath, contentType: 'image/png' });
  } catch {
    // Windowが終了済みの場合はtraceだけを残す。
  }

  await context.tracing.stop({ path: tracePath });
  await testInfo.attach('electron-trace', { path: tracePath, contentType: 'application/zip' });
};
