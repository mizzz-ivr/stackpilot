import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { TextDecoder } from 'node:util';
import type { ApiLogEntry, Workspace } from '../../../shared/contracts';
import type { SafeRequestBodyPreview } from '../../../shared/domain/requestBody';
import {
  createSafeRequestBodyPreview,
  maxCapturedRequestBodyBytes
} from '../../../shared/domain/requestBody';
import type { Session } from 'electron';
import { evaluateRequestRisk, toRequestPath, type RiskConfirmationRequest } from '../../../shared/domain/risk';

type PendingUploadCapture = {
  rawBody?: string;
  byteLength: number;
  tooLarge: boolean;
  unsupportedUpload: boolean;
  decodeFailed: boolean;
};

type RequestMeta = {
  startedAt: number;
  workspaceId: string;
  workspaceName: string;
  environmentType: Workspace['environmentType'];
  tabId: string;
  type: ApiLogEntry['type'];
  requestHeaders: Record<string, string>;
  requestBody?: SafeRequestBodyPreview;
  pendingUpload?: PendingUploadCapture;
};

type UploadDataItem = {
  bytes?: Buffer;
  blobUUID?: string;
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
      const pendingUpload = captureMemoryUploadData(details.uploadData as UploadDataItem[] | undefined);
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
          requestHeaders: {},
          pendingUpload
        });
        callback({ cancel: false });
      };

      void run();
    });

    session.webRequest.onBeforeSendHeaders((details, callback) => {
      const meta = this.requestMap.get(details.id);
      if (meta) {
        meta.requestHeaders = flattenHeaders(details.requestHeaders);
        if (meta.pendingUpload) {
          meta.requestBody = createSafeRequestBodyPreview({
            contentType: getHeaderValue(meta.requestHeaders, 'content-type'),
            rawBody: meta.pendingUpload.rawBody,
            byteLength: meta.pendingUpload.byteLength,
            tooLarge: meta.pendingUpload.tooLarge,
            unsupportedUpload: meta.pendingUpload.unsupportedUpload,
            decodeFailed: meta.pendingUpload.decodeFailed
          });
          meta.pendingUpload = undefined;
        }
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
        requestBody: meta.requestBody,
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
        requestBody: meta.requestBody,
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

const captureMemoryUploadData = (uploadData?: UploadDataItem[]): PendingUploadCapture | undefined => {
  if (!uploadData?.length) return undefined;

  let byteLength = 0;
  let unsupportedUpload = false;
  const chunks: Buffer[] = [];

  for (const item of uploadData) {
    if (item.blobUUID || !item.bytes) {
      unsupportedUpload = true;
      continue;
    }

    const chunk = Buffer.from(item.bytes);
    byteLength += chunk.byteLength;
    if (byteLength <= maxCapturedRequestBodyBytes) {
      chunks.push(chunk);
    }
  }

  if (unsupportedUpload) {
    return {
      byteLength,
      tooLarge: false,
      unsupportedUpload: true,
      decodeFailed: false
    };
  }

  if (byteLength > maxCapturedRequestBodyBytes) {
    return {
      byteLength,
      tooLarge: true,
      unsupportedUpload: false,
      decodeFailed: false
    };
  }

  if (byteLength <= 0) return undefined;

  try {
    return {
      rawBody: new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
      byteLength,
      tooLarge: false,
      unsupportedUpload: false,
      decodeFailed: false
    };
  } catch {
    return {
      byteLength,
      tooLarge: false,
      unsupportedUpload: false,
      decodeFailed: true
    };
  }
};

const getHeaderValue = (headers: Record<string, string>, targetName: string): string | undefined => {
  const target = targetName.toLowerCase();
  return Object.entries(headers).find(([name]) => name.toLowerCase() === target)?.[1];
};

const flattenHeaders = (headers?: Record<string, string[] | string>): Record<string, string> => {
  if (!headers) return {};
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value])
  );
};
