import { describe, expect, it } from 'vitest';
import {
  analyzeIpcUsageSource,
  readIpcUsageContract,
  validateIpcUsageCoverage
} from '../../scripts/lib/ipc-channel-usage.mjs';

const contractSource = `
  type StackpilotIpcChannels = {
    readonly request: 'sample:request';
    readonly changed: 'sample:changed';
  };
  type StackpilotIpcChannelUsage = 'invoke' | 'event';
  export const stackpilotIpcChannelUsages = {
    request: 'invoke',
    changed: 'event'
  } as const satisfies Record<keyof StackpilotIpcChannels, StackpilotIpcChannelUsage>;
`;

const readContract = () => readIpcUsageContract(contractSource, 'shared/domain/ipcChannels.ts');

const analyzeMain = (sourceText) =>
  analyzeIpcUsageSource({ sourceText, filePath: 'electron/main/ipc/registerHandlers.ts', side: 'main' });

const analyzePreload = (sourceText) =>
  analyzeIpcUsageSource({ sourceText, filePath: 'electron/preload/index.ts', side: 'preload' });

const validate = ({ mainSource = '', preloadSource = '' } = {}) => {
  const contract = readContract();
  return {
    contract,
    validation: validateIpcUsageCoverage({
      modes: contract.modes,
      mainResults: [analyzeMain(mainSource)],
      preloadResults: [analyzePreload(preloadSource)]
    })
  };
};

describe('IPC channel利用カバレッジ', () => {
  it('invokeとeventの正しいmain/preload利用を検証する', () => {
    const { contract, validation } = validate({
      mainSource: `
        ipcMain.handle(CHANNELS.request, () => true);
        mainWindow.webContents.send(CHANNELS.changed, { ok: true });
      `,
      preloadSource: `
        ipcRenderer.invoke(CHANNELS.request);
        ipcRenderer.on(CHANNELS.changed, listener);
        ipcRenderer.removeListener(CHANNELS.changed, listener);
      `
    });

    expect(contract.errors).toEqual([]);
    expect(validation.errors).toEqual([]);
    expect(validation.summary).toEqual({
      totalChannels: 2,
      invokeChannels: 1,
      eventChannels: 1,
      totalUsages: 5
    });
  });

  it('invoke channelのhandler・invoke欠落を検出する', () => {
    const { validation } = validate({
      mainSource: `mainWindow.webContents.send(CHANNELS.changed, {});`,
      preloadSource: `
        ipcRenderer.on(CHANNELS.changed, listener);
        ipcRenderer.removeListener(CHANNELS.changed, listener);
      `
    });

    expect(validation.errors).toContain(
      'channel「request」はinvokeのためipcMain.handleが1件必要です（検出: 0件）。'
    );
    expect(validation.errors).toContain('channel「request」はinvokeのためipcRenderer.invokeが必要です。');
  });

  it('通信種別と逆方向の利用を検出する', () => {
    const { validation } = validate({
      mainSource: `
        ipcMain.handle(CHANNELS.request, () => true);
        mainWindow.webContents.send(CHANNELS.request, {});
        ipcMain.handle(CHANNELS.changed, () => true);
      `,
      preloadSource: `
        ipcRenderer.invoke(CHANNELS.request);
        ipcRenderer.on(CHANNELS.request, listener);
        ipcRenderer.removeListener(CHANNELS.request, listener);
        ipcRenderer.invoke(CHANNELS.changed);
      `
    });

    expect(validation.errors.some((error) => error.includes('channel「request」はinvokeですがmain-send'))).toBe(true);
    expect(validation.errors.some((error) => error.includes('channel「request」はinvokeですがpreload-on'))).toBe(true);
    expect(validation.errors.some((error) => error.includes('channel「changed」はeventですがmain-handle'))).toBe(true);
    expect(validation.errors.some((error) => error.includes('channel「changed」はeventですがpreload-invoke'))).toBe(true);
  });

  it('直接文字列指定と未定義channel参照を検出する', () => {
    const mainResult = analyzeMain(`
      ipcMain.handle('sample:request', () => true);
      ipcMain.handle(CHANNELS.unknown, () => true);
    `);
    const contract = readContract();
    const validation = validateIpcUsageCoverage({
      modes: contract.modes,
      mainResults: [mainResult],
      preloadResults: [analyzePreload('')]
    });

    expect(mainResult.errors.some((error) => error.includes('直接文字列で指定せずCHANNELSを使用'))).toBe(true);
    expect(validation.errors.some((error) => error.includes('未定義のchannel key「unknown」'))).toBe(true);
  });

  it('main handlerの重複を検出する', () => {
    const { validation } = validate({
      mainSource: `
        ipcMain.handle(CHANNELS.request, () => true);
        ipcMain.handle(CHANNELS.request, () => false);
        mainWindow.webContents.send(CHANNELS.changed, {});
      `,
      preloadSource: `
        ipcRenderer.invoke(CHANNELS.request);
        ipcRenderer.on(CHANNELS.changed, listener);
        ipcRenderer.removeListener(CHANNELS.changed, listener);
      `
    });

    expect(validation.errors).toContain(
      'channel「request」はinvokeのためipcMain.handleが1件必要です（検出: 2件）。'
    );
  });

  it('eventの購読解除漏れを検出する', () => {
    const { validation } = validate({
      mainSource: `
        ipcMain.handle(CHANNELS.request, () => true);
        mainWindow.webContents.send(CHANNELS.changed, {});
      `,
      preloadSource: `
        ipcRenderer.invoke(CHANNELS.request);
        ipcRenderer.on(CHANNELS.changed, listener);
      `
    });

    expect(validation.errors).toContain(
      'channel「changed」の購読数と解除数が一致しません: on=1, removeListener=0'
    );
  });

  it('未対応のfire-and-forget APIを検出する', () => {
    const preloadResult = analyzePreload(`ipcRenderer.send(CHANNELS.request);`);

    expect(preloadResult.errors.some((error) => error.includes('未対応のIPC API「ipcRenderer.send」'))).toBe(true);
  });

  it('利用種別契約の不正値を拒否する', () => {
    const result = readIpcUsageContract(
      contractSource.replace("changed: 'event'", "changed: 'unknown'"),
      'shared/domain/ipcChannels.ts'
    );

    expect(result.errors).toContain(
      "shared/domain/ipcChannels.ts: channel「changed」の利用種別は'invoke'または'event'で指定してください。"
    );
  });
});
