import { BrowserView, BrowserWindow, session } from 'electron';
import type { Workspace } from '../../../shared/contracts';
import type { RequestReplayMethod } from '../../../shared/domain/requestReplay';
import { ApiLogService } from './apiLogService';
import { ResponseBodyCaptureService } from './responseBodyCaptureService';
import type { ReplayCaptureReservation } from './replayCaptureRegistry';

type ActiveTab = { view: BrowserView; workspaceId: string; tabId: string };

export type BrowserRequestReplayResult =
  | {
      status: 'replayed';
      responseStatus: number;
      durationMs: number;
      replayedLogId?: string;
    }
  | {
      status: 'failed';
      durationMs: number;
    }
  | {
      status: 'workspace-not-active';
    };

const replayCaptureGraceMs = 750;

export class BrowserViewManager {
  private activeTab?: ActiveTab;
  private views = new Map<string, BrowserView>();
  private readonly responseBodyCaptureService: ResponseBodyCaptureService;

  constructor(private readonly apiLogService: ApiLogService) {
    this.responseBodyCaptureService = new ResponseBodyCaptureService({
      onCapture: (capture) => this.apiLogService.applyCapturedResponseBody(capture),
      onStatusChange: ({ workspaceId, tabId, unavailableReason }) =>
        this.apiLogService.setResponseCaptureStatus(workspaceId, tabId, unavailableReason)
    });
  }

  openTab(window: BrowserWindow, workspace: Workspace, tabId: string, url: string): BrowserView {
    const key = `${workspace.id}:${tabId}`;
    const existing = this.views.get(key);
    if (existing) {
      window.setBrowserView(existing);
      existing.webContents.loadURL(url);
      this.resize(window, existing);
      this.activeTab = { view: existing, workspaceId: workspace.id, tabId };
      return existing;
    }

    const view = new BrowserView({
      webPreferences: {
        partition: workspace.partitionKey,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    const targetSession = session.fromPartition(workspace.partitionKey);
    this.apiLogService.attachSession(targetSession, workspace, (webContentsId) => {
      const hit = [...this.views.entries()].find(([, v]) => v.webContents.id === webContentsId);
      return hit?.[0].split(':')[1];
    });

    this.views.set(key, view);
    this.responseBodyCaptureService.attach(view.webContents, workspace.id, tabId);
    window.setBrowserView(view);
    view.webContents.loadURL(url);
    this.resize(window, view);
    this.activeTab = { view, workspaceId: workspace.id, tabId };
    return view;
  }

  openDevTools(): void {
    this.activeTab?.view.webContents.openDevTools({ mode: 'detach' });
  }

  async replaySafeRequest(
    workspaceId: string,
    method: RequestReplayMethod,
    url: string
  ): Promise<BrowserRequestReplayResult> {
    const active = this.activeTab;
    if (
      !active ||
      active.workspaceId !== workspaceId ||
      active.view.webContents.isDestroyed()
    ) {
      return { status: 'workspace-not-active' };
    }

    const capture = this.apiLogService.beginReplayCapture({
      workspaceId,
      tabId: active.tabId,
      method,
      url
    });

    const code = `
      (async () => {
        const startedAt = performance.now();
        try {
          const response = await fetch(${JSON.stringify(url)}, {
            method: ${JSON.stringify(method)},
            credentials: 'include',
            cache: 'no-store',
            redirect: 'follow'
          });
          return {
            status: 'replayed',
            responseStatus: response.status,
            durationMs: Math.max(0, Math.round(performance.now() - startedAt))
          };
        } catch {
          return {
            status: 'failed',
            durationMs: Math.max(0, Math.round(performance.now() - startedAt))
          };
        }
      })()
    `;

    try {
      const rawResult = await active.view.webContents.executeJavaScriptInIsolatedWorld(
        1001,
        [{ code }],
        true
      ) as unknown;
      const result = isBrowserReplayExecutionResult(rawResult)
        ? rawResult
        : { status: 'failed' as const, durationMs: 0 };

      if (result.status !== 'replayed') return result;

      const replayedLogId = await waitForCapturedReplayLog(capture);
      return replayedLogId ? { ...result, replayedLogId } : result;
    } catch {
      return { status: 'failed', durationMs: 0 };
    } finally {
      capture.cancel();
    }
  }

  resize(window: BrowserWindow, view?: BrowserView): void {
    const target = view ?? this.activeTab?.view;
    if (!target) return;
    const bounds = window.getContentBounds();
    target.setBounds({ x: 320, y: 92, width: bounds.width - 320, height: bounds.height - 92 });
    target.setAutoResize({ width: true, height: true });
  }

  currentWebContentsId(): number | undefined {
    return this.activeTab?.view.webContents.id;
  }
}

const waitForCapturedReplayLog = async (
  capture: ReplayCaptureReservation
): Promise<string | undefined> =>
  Promise.race([
    capture.result,
    new Promise<undefined>((resolve) => {
      setTimeout(() => resolve(undefined), replayCaptureGraceMs);
    })
  ]);

const isBrowserReplayExecutionResult = (
  value: unknown
): value is Exclude<BrowserRequestReplayResult, { status: 'workspace-not-active' }> => {
  if (typeof value !== 'object' || value === null) return false;
  const result = value as Record<string, unknown>;
  if (result.status === 'replayed') {
    return (
      typeof result.responseStatus === 'number' &&
      Number.isFinite(result.responseStatus) &&
      typeof result.durationMs === 'number' &&
      Number.isFinite(result.durationMs)
    );
  }
  return (
    result.status === 'failed' &&
    typeof result.durationMs === 'number' &&
    Number.isFinite(result.durationMs)
  );
};
