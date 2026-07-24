import { createHash, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { BrowserWindow, dialog } from 'electron';
import {
  isApiLogExportRequest,
  type ApiLogExportRequest,
  type SafeApiLogExportArtifact
} from '../../../shared/domain/apiLogExport';
import {
  apiLogExportPreviewContentMaxChars,
  apiLogExportPreviewTtlMs,
  createPreparedApiLogExportPreview,
  isApiLogExportDiscardRequest,
  isApiLogExportSaveRequest,
  type ApiLogExportMaskingReport,
  type ApiLogExportPreviewEntry,
  type ApiLogExportPreviewResult,
  type ApiLogExportSaveResult
} from '../../../shared/domain/apiLogExportPreview';
import type { Workspace } from '../../../shared/contracts';
import { ApiLogService } from './apiLogService';
import { WorkspaceService } from './workspaceService';

type ExportWorkspace = Pick<Workspace, 'id' | 'name' | 'environmentType' | 'customEnvironmentLabel'>;

type PreparedExport = {
  previewId: string;
  request: ApiLogExportRequest;
  workspace: ExportWorkspace;
  artifact: SafeApiLogExportArtifact;
  artifactSha256: string;
  exportedAt: number;
  expiresAt: number;
  maskingReport: ApiLogExportMaskingReport;
  sampleEntries: ApiLogExportPreviewEntry[];
};

export class ApiLogExportService {
  private preparedExport?: PreparedExport;
  private previewExpiryTimer?: NodeJS.Timeout;

  constructor(
    private readonly mainWindow: BrowserWindow,
    private readonly workspaceService: WorkspaceService,
    private readonly apiLogService: ApiLogService,
    private readonly now: () => number = Date.now,
    private readonly previewIdFactory: () => string = randomUUID
  ) {}

  preview(request: unknown): ApiLogExportPreviewResult {
    if (!isApiLogExportRequest(request)) {
      return previewFailedResult('invalid-request', 'エクスポート条件が不正です。');
    }

    const workspace = this.workspaceService
      .getSnapshot()
      .workspaces.find((item) => item.id === request.workspaceId);
    if (!workspace) {
      return previewFailedResult('workspace-not-found', '対象のワークスペースが見つかりません。');
    }

    try {
      const exportedAt = this.now();
      const prepared = createPreparedApiLogExportPreview({
        workspace,
        logs: this.apiLogService.list(workspace.id),
        format: request.format,
        filterKind: request.filterKind,
        exportedAt
      });
      const previewId = this.previewIdFactory();
      const expiresAt = exportedAt + apiLogExportPreviewTtlMs;
      const artifactSha256 = createHash('sha256').update(prepared.artifact.content).digest('hex');
      const exportWorkspace: ExportWorkspace = {
        id: workspace.id,
        name: workspace.name,
        environmentType: workspace.environmentType,
        customEnvironmentLabel: workspace.customEnvironmentLabel
      };

      this.clearPreparedExport();
      this.preparedExport = {
        previewId,
        request: { ...request },
        workspace: exportWorkspace,
        artifact: prepared.artifact,
        artifactSha256,
        exportedAt,
        expiresAt,
        maskingReport: prepared.maskingReport,
        sampleEntries: prepared.sampleEntries
      };
      this.previewExpiryTimer = setTimeout(() => {
        this.clearPreparedExport(previewId);
      }, apiLogExportPreviewTtlMs);
      this.previewExpiryTimer.unref?.();

      return {
        status: 'ready',
        preview: {
          previewId,
          format: request.format,
          filterKind: request.filterKind,
          workspace: exportWorkspace,
          exportedAt,
          expiresAt,
          exportedCount: prepared.artifact.exportedCount,
          omittedCount: prepared.artifact.omittedCount,
          contentByteLength: Buffer.byteLength(prepared.artifact.content, 'utf8'),
          artifactSha256,
          contentPreview: prepared.artifact.content.slice(0, apiLogExportPreviewContentMaxChars),
          isContentPreviewTruncated: prepared.artifact.content.length > apiLogExportPreviewContentMaxChars,
          maskingReport: prepared.maskingReport,
          sampleEntries: prepared.sampleEntries
        }
      };
    } catch {
      this.clearPreparedExport();
      return previewFailedResult('generation-failed', '安全化済みプレビューを生成できませんでした。');
    }
  }

  async save(request: unknown): Promise<ApiLogExportSaveResult> {
    if (!isApiLogExportSaveRequest(request)) {
      return saveFailedResult('invalid-request', '保存条件が不正です。');
    }

    const prepared = this.preparedExport;
    if (!prepared || prepared.previewId !== request.previewId) {
      return saveFailedResult('preview-not-found', '保存対象のプレビューが見つかりません。再度プレビューを生成してください。');
    }
    if (prepared.expiresAt <= this.now()) {
      this.clearPreparedExport(prepared.previewId);
      return saveFailedResult('preview-expired', 'プレビューの有効期限が切れました。再度プレビューを生成してください。');
    }
    if (this.mainWindow.isDestroyed()) {
      return saveFailedResult('dialog-unavailable', '保存ダイアログを開けませんでした。');
    }

    try {
      const defaultPath = createDefaultFileName(prepared.workspace.name, prepared.request, prepared.exportedAt);
      const saveResult = await dialog.showSaveDialog(this.mainWindow, {
        title: '確認済みの安全化済みAPIログを保存',
        defaultPath,
        buttonLabel: '保存',
        filters: [
          prepared.request.format === 'har'
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

      if (prepared.expiresAt <= this.now()) {
        this.clearPreparedExport(prepared.previewId);
        return saveFailedResult('preview-expired', 'プレビューの有効期限が切れました。再度プレビューを生成してください。');
      }
      if (this.preparedExport?.previewId !== prepared.previewId) {
        return saveFailedResult('preview-not-found', '保存対象のプレビューが破棄されました。再度プレビューを生成してください。');
      }

      await writeFile(saveResult.filePath, prepared.artifact.content, { encoding: 'utf8' });
      this.clearPreparedExport(prepared.previewId);
      return {
        status: 'saved',
        filePath: saveResult.filePath,
        exportedCount: prepared.artifact.exportedCount,
        omittedCount: prepared.artifact.omittedCount,
        artifactSha256: prepared.artifactSha256
      };
    } catch {
      return saveFailedResult(
        'write-failed',
        'APIログを保存できませんでした。保存先の権限と空き容量を確認してください。'
      );
    }
  }

  discard(request: unknown): boolean {
    if (!isApiLogExportDiscardRequest(request)) return false;
    if (this.preparedExport?.previewId !== request.previewId) return false;
    this.clearPreparedExport(request.previewId);
    return true;
  }

  private clearPreparedExport(previewId?: string): void {
    if (previewId && this.preparedExport?.previewId !== previewId) return;
    if (this.previewExpiryTimer) {
      clearTimeout(this.previewExpiryTimer);
      this.previewExpiryTimer = undefined;
    }
    this.preparedExport = undefined;
  }
}

const createDefaultFileName = (
  workspaceName: string,
  request: ApiLogExportRequest,
  exportedAt: number
): string => {
  const safeWorkspaceName = workspaceName
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'workspace';
  const timestamp = new Date(exportedAt).toISOString().replace(/[:.]/g, '-');
  return `${safeWorkspaceName}-${request.filterKind}-${timestamp}.${request.format}`;
};

const previewFailedResult = (
  errorCode: 'invalid-request' | 'workspace-not-found' | 'generation-failed',
  errorMessage: string
): ApiLogExportPreviewResult => ({ status: 'failed', errorCode, errorMessage });

const saveFailedResult = (
  errorCode: Extract<ApiLogExportSaveResult, { status: 'failed' }>['errorCode'],
  errorMessage: string
): ApiLogExportSaveResult => ({
  status: 'failed',
  exportedCount: 0,
  omittedCount: 0,
  errorCode,
  errorMessage
});
