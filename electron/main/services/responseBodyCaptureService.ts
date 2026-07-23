import { Buffer } from 'node:buffer';
import { TextDecoder } from 'node:util';
import type { Event, WebContents } from 'electron';
import {
  createSafeResponseBodyPreview,
  createUnavailableResponseBodyPreview,
  isSupportedResponseBodyContentType,
  maxCapturedResponseBodyBytes,
  normalizeResponseBodyContentType,
  type ResponseBodyUnavailableReason,
  type SafeResponseBodyPreview
} from '../../../shared/domain/responseBody';

export interface CapturedResponseBody {
  workspaceId: string;
  tabId: string;
  method: string;
  url: string;
  status?: number;
  responseBody: SafeResponseBodyPreview;
}

export interface ResponseCaptureStatusChange {
  workspaceId: string;
  tabId: string;
  unavailableReason?: ResponseBodyUnavailableReason;
}

interface ResponseBodyCaptureHandlers {
  onCapture: (capture: CapturedResponseBody) => void;
  onStatusChange: (status: ResponseCaptureStatusChange) => void;
}

interface CaptureCandidate {
  requestId: string;
  method: string;
  url: string;
  resourceType?: string;
  status?: number;
  contentType?: string;
}

interface CaptureContext {
  webContents: WebContents;
  workspaceId: string;
  tabId: string;
  candidates: Map<string, CaptureCandidate>;
  isAttached: boolean;
}

interface RequestWillBeSentParams {
  requestId: string;
  type?: string;
  request: {
    url: string;
    method: string;
  };
}

interface ResponseReceivedParams {
  requestId: string;
  type?: string;
  response: {
    url: string;
    status: number;
    mimeType?: string;
    headers?: Record<string, string | number>;
  };
}

interface LoadingFinishedParams {
  requestId: string;
  encodedDataLength: number;
}

interface LoadingFailedParams {
  requestId: string;
}

interface GetResponseBodyResult {
  body: string;
  base64Encoded: boolean;
}

const maxTotalBufferSize = 4 * 1024 * 1024;
const maxResourceBufferSize = 128 * 1024;

export class ResponseBodyCaptureService {
  private readonly contexts = new WeakMap<WebContents, CaptureContext>();

  constructor(private readonly handlers: ResponseBodyCaptureHandlers) {}

  attach(webContents: WebContents, workspaceId: string, tabId: string): void {
    if (this.contexts.has(webContents)) return;

    const context: CaptureContext = {
      webContents,
      workspaceId,
      tabId,
      candidates: new Map(),
      isAttached: false
    };
    this.contexts.set(webContents, context);

    const onMessage = (_event: Event, method: string, params: unknown): void => {
      void this.handleMessage(context, method, params);
    };
    const onDetach = (): void => {
      context.isAttached = false;
      context.candidates.clear();
      if (webContents.isDestroyed()) return;

      this.handlers.onStatusChange({
        workspaceId,
        tabId,
        unavailableReason: webContents.isDevToolsOpened() ? 'devtools-open' : 'capture-unavailable'
      });
    };
    const onDevToolsClosed = (): void => {
      void this.connect(context);
    };
    const cleanup = (): void => {
      context.candidates.clear();
      webContents.debugger.removeListener('message', onMessage);
      webContents.debugger.removeListener('detach', onDetach);
      webContents.removeListener('devtools-closed', onDevToolsClosed);
    };

    webContents.debugger.on('message', onMessage);
    webContents.debugger.on('detach', onDetach);
    webContents.on('devtools-closed', onDevToolsClosed);
    webContents.once('destroyed', cleanup);

    void this.connect(context);
  }

  private async connect(context: CaptureContext): Promise<void> {
    const { webContents, workspaceId, tabId } = context;
    if (webContents.isDestroyed() || context.isAttached) return;

    if (webContents.isDevToolsOpened()) {
      this.handlers.onStatusChange({ workspaceId, tabId, unavailableReason: 'devtools-open' });
      return;
    }

    try {
      if (!webContents.debugger.isAttached()) {
        webContents.debugger.attach('1.3');
      }
      await webContents.debugger.sendCommand('Network.enable', {
        maxTotalBufferSize,
        maxResourceBufferSize,
        maxPostDataSize: 16 * 1024
      });
      context.isAttached = true;
      this.handlers.onStatusChange({ workspaceId, tabId, unavailableReason: undefined });
    } catch {
      context.isAttached = false;
      if (webContents.debugger.isAttached() && !webContents.isDevToolsOpened()) {
        try {
          webContents.debugger.detach();
        } catch {
          // 接続失敗時のdetachエラーは取得不可状態として扱う。
        }
      }
      this.handlers.onStatusChange({ workspaceId, tabId, unavailableReason: 'capture-unavailable' });
    }
  }

  private async handleMessage(context: CaptureContext, method: string, params: unknown): Promise<void> {
    if (method === 'Network.requestWillBeSent') {
      const event = params as RequestWillBeSentParams;
      context.candidates.set(event.requestId, {
        requestId: event.requestId,
        method: event.request.method,
        url: event.request.url,
        resourceType: event.type
      });
      return;
    }

    if (method === 'Network.responseReceived') {
      const event = params as ResponseReceivedParams;
      const candidate = context.candidates.get(event.requestId);
      if (!candidate) return;

      candidate.resourceType = event.type ?? candidate.resourceType;
      candidate.status = event.response.status;
      candidate.contentType = getResponseContentType(event.response.headers, event.response.mimeType);
      return;
    }

    if (method === 'Network.loadingFailed') {
      const event = params as LoadingFailedParams;
      context.candidates.delete(event.requestId);
      return;
    }

    if (method !== 'Network.loadingFinished') return;

    const event = params as LoadingFinishedParams;
    const candidate = context.candidates.get(event.requestId);
    context.candidates.delete(event.requestId);
    if (!candidate || !isApiResourceType(candidate.resourceType)) return;

    const encodedByteLength = Math.max(0, Math.round(event.encodedDataLength));
    if (!isSupportedResponseBodyContentType(candidate.contentType)) {
      this.emitCapture(
        context,
        candidate,
        createUnavailableResponseBodyPreview(
          'unsupported-content-type',
          candidate.contentType,
          encodedByteLength
        )
      );
      return;
    }

    if (encodedByteLength > maxCapturedResponseBodyBytes) {
      this.emitCapture(
        context,
        candidate,
        createUnavailableResponseBodyPreview(
          'body-too-large',
          candidate.contentType,
          encodedByteLength,
          true
        )
      );
      return;
    }

    try {
      const result = (await context.webContents.debugger.sendCommand('Network.getResponseBody', {
        requestId: candidate.requestId
      })) as GetResponseBodyResult;
      const decoded = decodeResponseBody(result);
      const responseBody = createSafeResponseBodyPreview({
        contentType: candidate.contentType,
        rawBody: decoded.rawBody,
        byteLength: decoded.byteLength,
        tooLarge: decoded.byteLength > maxCapturedResponseBodyBytes,
        decodeFailed: decoded.decodeFailed
      });
      if (responseBody) this.emitCapture(context, candidate, responseBody);
    } catch {
      this.emitCapture(
        context,
        candidate,
        createUnavailableResponseBodyPreview(
          'body-unavailable',
          candidate.contentType,
          encodedByteLength
        )
      );
    }
  }

  private emitCapture(
    context: CaptureContext,
    candidate: CaptureCandidate,
    responseBody: SafeResponseBodyPreview
  ): void {
    this.handlers.onCapture({
      workspaceId: context.workspaceId,
      tabId: context.tabId,
      method: candidate.method,
      url: candidate.url,
      status: candidate.status,
      responseBody
    });
  }
}

const isApiResourceType = (resourceType?: string): boolean => {
  const normalized = resourceType?.toLowerCase();
  return normalized === 'xhr' || normalized === 'fetch';
};

const getResponseContentType = (
  headers?: Record<string, string | number>,
  mimeType?: string
): string | undefined => {
  const headerValue = headers
    ? Object.entries(headers).find(([name]) => name.toLowerCase() === 'content-type')?.[1]
    : undefined;
  return normalizeResponseBodyContentType(
    typeof headerValue === 'string' || typeof headerValue === 'number'
      ? String(headerValue)
      : mimeType
  );
};

const decodeResponseBody = (
  result: GetResponseBodyResult
): { rawBody?: string; byteLength: number; decodeFailed: boolean } => {
  try {
    if (result.base64Encoded) {
      const bytes = Buffer.from(result.body, 'base64');
      return {
        rawBody: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
        byteLength: bytes.byteLength,
        decodeFailed: false
      };
    }

    return {
      rawBody: result.body,
      byteLength: Buffer.byteLength(result.body, 'utf8'),
      decodeFailed: false
    };
  } catch {
    return {
      byteLength: result.base64Encoded
        ? Buffer.from(result.body, 'base64').byteLength
        : Buffer.byteLength(result.body, 'utf8'),
      decodeFailed: true
    };
  }
};
