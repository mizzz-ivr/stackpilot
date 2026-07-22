import { randomUUID } from 'node:crypto';
import type { ApiLogEntry, Workspace } from '../../../shared/contracts';
import type { Session } from 'electron';
import { evaluateRequestRisk, toRequestPath, type RiskConfirmationRequest } from '../../../shared/domain/risk';

type RequestMeta = {
  startedAt: number;
  workspaceId: string;
  workspaceName: string;
  environmentType: Workspace['environmentType'];
  tabId: string;
  type: ApiLogEntry['type'];
  requestHeaders: Record<string, string>;
};

type LogListener = (entry: ApiLogEntry) => void;
export type ConfirmRiskHandler = (request: RiskConfirmationRequest) => Promise<boolean>;

export class ApiLogService {
  private logs: ApiLogEntry[] = [];
  private requestMap = new Map<number, RequestMeta>();
  private attachedSessions = new WeakSet<Session>();
  private listeners = new Set<LogListener>();

  private confirmRiskHandler?: ConfirmRiskHandler;

  constructor(confirmRiskHandler?: ConfirmRiskHandler) {
    this.confirmRiskHandler = confirmRiskHandler;
  }

  setConfirmRiskHandler(handler: ConfirmRiskHandler): void {
    this.confirmRiskHandler = handler;
  }

  attachSession(session: Session, workspace: Workspace, tabIdResolver: (webContentsId: number) => string | undefined): void {
    if (this.attachedSessions.has(session)) {
      return;
    }
    this.attachedSessions.add(session);

    session.webRequest.onBeforeRequest((details, callback) => {
      const run = async (): Promise<void> => {
        const tabId = tabIdResolver(details.webContentsId ?? -1) ?? 'unknown';
        const risk = evaluateRequestRisk({
          environmentType: workspace.environmentType,
          method: details.method,
          url: details.url
        });

        if (risk.shouldConfirm && this.confirmRiskHandler) {
          const level = risk.level === 'none' ? 'warning' : risk.level;
          const reasonCode = risk.reasonCode === 'none' ? 'prod-mutating' : risk.reasonCode;
          const allow = await this.confirmRiskHandler({
            confirmationId: `${details.id}:${Date.now()}`,
            workspaceId: workspace.id,
            workspaceName: workspace.name,
            environmentType: workspace.environmentType,
            method: details.method,
            url: details.url,
            path: toRequestPath(details.url),
            level,
            reasonCode
          });
          if (!allow) {
            callback({ cancel: true });
            return;
          }
        }

        const resourceType = details.resourceType;
        const type: ApiLogEntry['type'] = resourceType === 'xhr' ? 'xhr' : 'other';
        this.requestMap.set(details.id, {
          startedAt: Date.now(),
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          environmentType: workspace.environmentType,
          tabId,
          type,
          requestHeaders: {}
        });
        callback({ cancel: false });
      };

      void run();
    });

    session.webRequest.onBeforeSendHeaders((details, callback) => {
      const meta = this.requestMap.get(details.id);
      if (meta) {
        meta.requestHeaders = flattenHeaders(details.requestHeaders);
      }
      callback({ requestHeaders: details.requestHeaders });
    });

    session.webRequest.onCompleted((details) => {
      const meta = this.requestMap.get(details.id);
      if (!meta) return;
      this.requestMap.delete(details.id);

      const finishedAt = Date.now();
      const entry: ApiLogEntry = {
        id: randomUUID(),
        workspaceId: meta.workspaceId,
        tabId: meta.tabId,
        type: meta.type,
        method: details.method,
        url: details.url,
        status: details.statusCode,
        durationMs: finishedAt - meta.startedAt,
        requestHeaders: meta.requestHeaders,
        responseHeaders: flattenHeaders(details.responseHeaders),
        startedAt: meta.startedAt,
        finishedAt
      };

      this.logs.unshift(entry);
      this.logs = this.logs.slice(0, 5000);
      this.listeners.forEach((listener) => listener(entry));
    });

    session.webRequest.onErrorOccurred((details) => {
      const meta = this.requestMap.get(details.id);
      if (!meta) return;
      this.requestMap.delete(details.id);

      const finishedAt = Date.now();
      const entry: ApiLogEntry = {
        id: randomUUID(),
        workspaceId: meta.workspaceId,
        tabId: meta.tabId,
        type: meta.type,
        method: details.method,
        url: details.url,
        status: undefined,
        durationMs: finishedAt - meta.startedAt,
        requestHeaders: meta.requestHeaders,
        responseHeaders: {},
        responseBodySnippet: details.error,
        startedAt: meta.startedAt,
        finishedAt
      };

      this.logs.unshift(entry);
      this.logs = this.logs.slice(0, 5000);
      this.listeners.forEach((listener) => listener(entry));
    });
  }

  onLog(listener: LogListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  list(workspaceId: string): ApiLogEntry[] {
    return this.logs.filter((item) => item.workspaceId === workspaceId);
  }
}

const flattenHeaders = (headers?: Record<string, string[] | string>): Record<string, string> => {
  if (!headers) return {};
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value])
  );
};
