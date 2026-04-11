import { randomUUID } from 'node:crypto';
import type { ApiLogEntry } from '../../../shared/contracts';
import type { Session } from 'electron';

type RequestMeta = { startedAt: number; workspaceId: string; tabId: string; type: ApiLogEntry['type'] };

export class ApiLogService {
  private logs: ApiLogEntry[] = [];
  private requestMap = new Map<number, RequestMeta>();

  attachSession(session: Session, workspaceId: string, tabIdResolver: (webContentsId: number) => string | undefined): void {
    session.webRequest.onBeforeRequest((details, callback) => {
      const tabId = tabIdResolver(details.webContentsId ?? -1) ?? 'unknown';
      const resourceType = details.resourceType;
      const type = resourceType === 'xhr' ? 'xhr' : resourceType === 'fetch' ? 'fetch' : 'other';
      this.requestMap.set(details.id, { startedAt: Date.now(), workspaceId, tabId, type });
      callback({ cancel: false });
    });

    session.webRequest.onCompleted((details) => {
      const meta = this.requestMap.get(details.id);
      if (!meta) return;
      this.requestMap.delete(details.id);

      const entry: ApiLogEntry = {
        id: randomUUID(),
        workspaceId: meta.workspaceId,
        tabId: meta.tabId,
        type: meta.type,
        method: details.method,
        url: details.url,
        status: details.statusCode,
        durationMs: Date.now() - meta.startedAt,
        requestHeaders: {},
        responseHeaders: flattenHeaders(details.responseHeaders),
        startedAt: meta.startedAt,
        finishedAt: Date.now()
      };

      this.logs.unshift(entry);
      this.logs = this.logs.slice(0, 5000);
    });
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
