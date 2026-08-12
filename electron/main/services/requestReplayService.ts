import { dialog, type BrowserWindow } from 'electron';
import { isProdEnvironment } from '../../../shared/domain/environment';
import {
  createRequestReplayTargetUrl,
  evaluateRequestReplayEligibility,
  isRequestReplayRequest,
  validateRequestReplayQueryEntries,
  type RequestReplayMethod,
  type RequestReplayResult
} from '../../../shared/domain/requestReplay';
import type { ApiLogService } from './apiLogService';
import type {
  BrowserRequestReplayResult,
  BrowserViewManager
} from './browserViewManager';
import type { WorkspaceService } from './workspaceService';

export type RequestReplayExecutor = (
  workspaceId: string,
  method: RequestReplayMethod,
  url: string
) => Promise<BrowserRequestReplayResult>;

export class RequestReplayService {
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly mainWindow: BrowserWindow,
    private readonly workspaceService: WorkspaceService,
    private readonly apiLogService: ApiLogService,
    private readonly executeReplay: RequestReplayExecutor
  ) {}

  async replay(request: unknown): Promise<RequestReplayResult> {
    if (!isRequestReplayRequest(request)) {
      return failed('invalid-request', 'Request Replayの実行条件が不正です。');
    }

    const snapshot = this.workspaceService.getSnapshot();
    const workspace = snapshot.workspaces.find((item) => item.id === request.workspaceId);
    if (!workspace) {
      return failed('workspace-not-found', '対象のワークスペースが見つかりません。');
    }

    const workspaceLogs = this.apiLogService.list(workspace.id);
    const log = workspaceLogs.find((item) => item.id === request.logId);
    if (!log) {
      const existsInAnotherWorkspace = snapshot.workspaces.some((item) =>
        item.id !== workspace.id && this.apiLogService.list(item.id).some((candidate) => candidate.id === request.logId)
      );
      return existsInAnotherWorkspace
        ? failed('workspace-mismatch', '選択した通信は別のワークスペースに属しています。')
        : failed('log-not-found', '再実行対象の通信ログが見つかりません。');
    }

    if (log.workspaceId !== workspace.id) {
      return failed('workspace-mismatch', '選択した通信は別のワークスペースに属しています。');
    }

    const eligibility = evaluateRequestReplayEligibility(log);
    if (!eligibility.replayable) {
      return failed(
        'not-replayable',
        eligibility.reasonMessage ?? 'この通信は安全なRequest Replayの対象外です。'
      );
    }

    if (request.queryEntries) {
      const queryValidation = validateRequestReplayQueryEntries(request.queryEntries);
      if (!queryValidation.valid) {
        return failed('invalid-query', queryValidation.errorMessage);
      }
    }

    const targetUrl = createRequestReplayTargetUrl(log.url, request.queryEntries);
    const replayKey = `${workspace.id}:${log.id}`;
    if (this.inFlight.has(replayKey)) {
      return failed('replay-in-progress', 'この通信はすでに再実行中です。');
    }

    this.inFlight.add(replayKey);
    try {
      if (isProdEnvironment(workspace.environmentType)) {
        if (this.mainWindow.isDestroyed()) {
          return failed('dialog-unavailable', '本番環境の再実行確認ダイアログを開けませんでした。');
        }

        const confirmation = await dialog.showMessageBox(this.mainWindow, {
          type: 'warning',
          title: '本番環境のRequest Replay',
          message: `PROD Workspaceで${eligibility.method}通信を再実行します`,
          detail: [
            '元ログのAuthorization・Cookie・custom header・Request bodyはコピーしません。',
            'originとpathは元通信からmain processが再構築し、queryだけを編集内容へ置き換えます。',
            'ただし、現在のブラウザセッションのCookieが通常のfetch挙動として送信される可能性があります。',
            '意図した通信であることを確認できる場合だけ再実行してください。'
          ].join('\n'),
          buttons: ['キャンセル', '再実行'],
          defaultId: 0,
          cancelId: 0,
          noLink: true
        });
        if (confirmation.response !== 1) {
          return { status: 'cancelled' };
        }
      }

      const result = await this.executeReplay(
        workspace.id,
        eligibility.method as RequestReplayMethod,
        targetUrl
      );

      if (result.status === 'workspace-not-active') {
        return failed(
          'workspace-not-active',
          '対象のワークスペースが現在のブラウザ表示でアクティブではありません。対象Workspaceのタブを開いてから再実行してください。'
        );
      }
      if (result.status === 'failed') {
        return failed(
          'execution-failed',
          'Request Replayに失敗しました。CORS、ネットワーク状態、現在のブラウザセッションを確認してください。'
        );
      }

      return {
        status: 'replayed',
        responseStatus: result.responseStatus,
        durationMs: result.durationMs
      };
    } finally {
      this.inFlight.delete(replayKey);
    }
  }
}

export const createRequestReplayExecutor = (
  browserViewManager: BrowserViewManager
): RequestReplayExecutor =>
  (workspaceId, method, url) => browserViewManager.replaySafeRequest(workspaceId, method, url);

const failed = (
  errorCode: Extract<RequestReplayResult, { status: 'failed' }>['errorCode'],
  errorMessage: string
): RequestReplayResult => ({ status: 'failed', errorCode, errorMessage });
