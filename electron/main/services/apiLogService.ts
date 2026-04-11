import { randomUUID } from 'node:crypto';
import type { ApiLogEntry } from '../../../shared/contracts';
import type { Session } from 'electron';

type RequestMeta = { startedAt: number; workspaceId: string; tabId: string; type: ApiLogEntry['type'] };

type LogListener = (entry: ApiLogEntry) => void;

export class ApiLogService {
  private logs: ApiLogEntry[] = [];
  private requestMap = new Map<number, RequestMeta>();
  private attachedSessions = new WeakSet<Session>();
  private listeners = new Set<LogListener>();

  attachSession(session: Session, workspaceId: string, tabIdResolver: (webContentsId: number) => string | undefined): void {
    if (this.attachedSessions.has(session)) {
      return;
    }
    this.attachedSessions.add(session);

    session.webRequest.onBeforeRequest((details, callback) => {
      const tabId = tabIdResolver(details.webContentsId ?? -1) ?? 'unknown';
      const resourceType = details.resourceType;
      const type = resourceType === 'xhr' ? 'xhr' : 'other';
      this.requestMap.set(details.id, { startedAt: Date.now(), workspaceId, tabId, type });
      callback({ cancel: false });
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
        requestHeaders: {},
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
        requestHeaders: {},
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
