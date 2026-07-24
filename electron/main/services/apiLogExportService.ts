import { writeFile } from 'node:fs/promises';
import { BrowserWindow, dialog } from 'electron';
import {
  createSafeApiLogExport,
  isApiLogExportRequest,
  type ApiLogExportRequest,
  type ApiLogExportResult
} from '../../../shared/domain/apiLogExport';
import { ApiLogService } from './apiLogService';
import { WorkspaceService } from './workspaceService';

export class ApiLogExportService {
  constructor(
    private readonly mainWindow: BrowserWindow,
    private readonly workspaceService: WorkspaceService,
    private readonly apiLogService: ApiLogService
  ) {}

  async export(request: unknown): Promise<ApiLogExportResult> {
    if (!isApiLogExportRequest(request)) {
      return failedResult('エクスポート条件が不正です。');
    }

    const workspace = this.workspaceService
      .getSnapshot()
      .workspaces.find((item) => item.id === request.workspaceId);
    if (!workspace) {
      return failedResult('対象のワークスペースが見つかりません。');
    }
    if (this.mainWindow.isDestroyed()) {
      return failedResult('保存ダイアログを開けませんでした。');
    }

    try {
      const artifact = createSafeApiLogExport({
        workspace,
        logs: this.apiLogService.list(workspace.id),
        format: request.format,
        filterKind: request.filterKind
      });
      const defaultPath = createDefaultFileName(workspace.name, request);
      const saveResult = await dialog.showSaveDialog(this.mainWindow, {
        title: '安全化済みAPIログを保存',
        defaultPath,
        buttonLabel: '保存',
        filters: [
          request.format === 'har'
            ? { name: 'HTTP Archive', extensions: ['har'] }
            : { name: 'Stackpilot Safe JSON', extensions: ['json'] }
        ],
        properties: ['showOverwriteConfirmation', 'createDirectory']
      });

      if (saveResult.canceled || !saveResult.filePath) {
        return {
          status: 'cancelled',
          exportedCount: 0,
          omittedCount: 0
        };
      }

      await writeFile(saveResult.filePath, artifact.content, { encoding: 'utf8' });
      return {
        status: 'saved',
        filePath: saveResult.filePath,
        exportedCount: artifact.exportedCount,
        omittedCount: artifact.omittedCount
      };
    } catch {
      return failedResult('APIログを保存できませんでした。保存先の権限と空き容量を確認してください。');
    }
  }
}

const createDefaultFileName = (
  workspaceName: string,
  request: ApiLogExportRequest
): string => {
  const safeWorkspaceName = workspaceName
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'workspace';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${safeWorkspaceName}-${request.filterKind}-${timestamp}.${request.format}`;
};

const failedResult = (errorMessage: string): ApiLogExportResult => ({
  status: 'failed',
  exportedCount: 0,
  omittedCount: 0,
  errorMessage
});
