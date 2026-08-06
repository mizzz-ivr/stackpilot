import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { BrowserWindow, dialog } from 'electron';
import {
  createSafeApiLogComparisonArtifact,
  isApiLogComparisonExportRequest,
  type ApiLogComparisonExportResult
} from '../../../shared/domain/apiLogComparisonExport';
import { ApiLogService } from './apiLogService';
import { WorkspaceService } from './workspaceService';

export class ApiLogComparisonExportService {
  constructor(
    private readonly mainWindow: BrowserWindow,
    private readonly workspaceService: WorkspaceService,
    private readonly apiLogService: ApiLogService,
    private readonly now: () => number = Date.now
  ) {}

  async save(request: unknown): Promise<ApiLogComparisonExportResult> {
    if (!isApiLogComparisonExportRequest(request)) {
      return failed('invalid-request', '比較対象または保存条件が不正です。');
    }

    const workspace = this.workspaceService
      .getSnapshot()
      .workspaces.find((item) => item.id === request.workspaceId);
    if (!workspace) {
      return failed('workspace-not-found', '対象のワークスペースが見つかりません。');
    }

    const logs = this.apiLogService.list(workspace.id);
    const left = logs.find((log) => log.id === request.leftLogId);
    const right = logs.find((log) => log.id === request.rightLogId);
    if (!left || !right) {
      return failed('logs-not-found', '比較対象の通信が見つかりません。再度2件を選択してください。');
    }

    let artifact;
    const exportedAt = this.now();
    try {
      artifact = createSafeApiLogComparisonArtifact({
        workspace,
        left,
        right,
        differencesOnly: request.differencesOnly,
        exportedAt
      });
    } catch {
      return failed('generation-failed', '安全化済みの比較レポートを生成できませんでした。');
    }

    if (this.mainWindow.isDestroyed()) {
      return failed('dialog-unavailable', '保存ダイアログを開けませんでした。');
    }

    try {
      const saveResult = await dialog.showSaveDialog(this.mainWindow, {
        title: '安全化済みAPI通信比較レポートを保存',
        defaultPath: createDefaultFileName(workspace.name, exportedAt, request.differencesOnly),
        buttonLabel: '保存',
        filters: [{ name: 'Stackpilot Comparison JSON', extensions: ['json'] }],
        properties: ['showOverwriteConfirmation', 'createDirectory']
      });

      if (saveResult.canceled || !saveResult.filePath) {
        return {
          status: 'cancelled',
          differenceCount: artifact.differenceCount,
          exportedItemCount: artifact.exportedItemCount
        };
      }

      const currentLogs = this.apiLogService.list(workspace.id);
      if (
        !currentLogs.some((log) => log.id === request.leftLogId) ||
        !currentLogs.some((log) => log.id === request.rightLogId)
      ) {
        return failed('logs-not-found', '保存前に比較対象の通信が失われました。再度2件を選択してください。');
      }

      await writeFile(saveResult.filePath, artifact.content, { encoding: 'utf8' });
      return {
        status: 'saved',
        filePath: saveResult.filePath,
        artifactSha256: createHash('sha256').update(artifact.content).digest('hex'),
        differenceCount: artifact.differenceCount,
        exportedItemCount: artifact.exportedItemCount
      };
    } catch {
      return failed(
        'write-failed',
        '比較レポートを保存できませんでした。保存先の権限と空き容量を確認してください。'
      );
    }
  }
}

const createDefaultFileName = (
  workspaceName: string,
  exportedAt: number,
  differencesOnly: boolean
): string => {
  const safeWorkspaceName = workspaceName
    .replace(/[\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'workspace';
  const timestamp = new Date(exportedAt).toISOString().replace(/[:.]/g, '-');
  const suffix = differencesOnly ? 'differences' : 'all';
  return `${safeWorkspaceName}-api-comparison-${suffix}-${timestamp}.json`;
};

const failed = (
  errorCode: Extract<ApiLogComparisonExportResult, { status: 'failed' }>['errorCode'],
  errorMessage: string
): ApiLogComparisonExportResult => ({
  status: 'failed',
  errorCode,
  errorMessage,
  differenceCount: 0,
  exportedItemCount: 0
});
