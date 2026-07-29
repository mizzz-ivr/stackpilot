import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import {
  analyzeIpcUsageSource,
  readIpcUsageContract,
  validateIpcUsageCoverage
} from './lib/ipc-channel-usage.mjs';

const contractPath = 'shared/domain/ipcChannels.ts';
const mainRoot = 'electron/main';
const preloadRoot = 'electron/preload';

const contractSource = await readFile(contractPath, 'utf8');
const contract = readIpcUsageContract(contractSource, contractPath);
const mainResults = await analyzeDirectory(mainRoot, 'main');
const preloadResults = await analyzeDirectory(preloadRoot, 'preload');
const validation = validateIpcUsageCoverage({
  modes: contract.modes,
  mainResults,
  preloadResults
});
const errors = [...contract.errors, ...validation.errors];

if (errors.length > 0) {
  console.error('IPC channel利用カバレッジチェックに失敗しました。');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const { totalChannels, invokeChannels, eventChannels, totalUsages } = validation.summary;
  console.log(
    `IPC channel利用カバレッジチェック成功: ${totalChannels}件（invoke ${invokeChannels}件 / event ${eventChannels}件）、利用箇所 ${totalUsages}件。`
  );
}

async function analyzeDirectory(rootPath, side) {
  const filePaths = await listTypeScriptFiles(rootPath);
  return Promise.all(
    filePaths.map(async (filePath) =>
      analyzeIpcUsageSource({
        sourceText: await readFile(filePath, 'utf8'),
        filePath: toPortablePath(filePath),
        side
      })
    )
  );
}

async function listTypeScriptFiles(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const nestedPaths = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) return listTypeScriptFiles(entryPath);
      if (!entry.isFile()) return [];
      if (!/\.tsx?$/.test(entry.name) || entry.name.endsWith('.d.ts')) return [];
      return [entryPath];
    })
  );
  return nestedPaths.flat().sort();
}

function toPortablePath(filePath) {
  return filePath.split(path.sep).join('/');
}
