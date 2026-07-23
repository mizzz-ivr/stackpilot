import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import type { ApiLogEntry, AppSnapshot, Workspace } from '../../../shared/contracts';
import type { MobileInspectorPayload, MobileWorkspaceSummary } from '../../../shared/domain/mobileInspector';
import {
  createMobilePairingUri,
  type MobilePairingServerStatus
} from '../../../shared/domain/mobilePairing';

const defaultPairingTtlMs = 10 * 60 * 1000;
const maxRequestsPerMinute = 120;
const snapshotPath = '/v1/mobile/inspector/snapshot';

export interface MobileInspectorServerDependencies {
  getSnapshot: () => AppSnapshot;
  listLogs: (workspaceId: string) => ApiLogEntry[];
  resolveLanAddress?: () => string | undefined;
  now?: () => number;
  tokenFactory?: () => string;
  ttlMs?: number;
}

type StatusListener = (status: MobilePairingServerStatus) => void;

type RequestRateState = {
  count: number;
  windowStartedAt: number;
};

export class MobileInspectorServer {
  private server?: Server;
  private token?: string;
  private expiresAt?: number;
  private expiryTimer?: NodeJS.Timeout;
  private status: MobilePairingServerStatus = { state: 'stopped' };
  private listeners = new Set<StatusListener>();
  private requestRates = new Map<string, RequestRateState>();

  private readonly now: () => number;
  private readonly resolveLanAddress: () => string | undefined;
  private readonly tokenFactory: () => string;
  private readonly ttlMs: number;

  constructor(private readonly dependencies: MobileInspectorServerDependencies) {
    this.now = dependencies.now ?? Date.now;
    this.resolveLanAddress = dependencies.resolveLanAddress ?? resolvePrivateLanAddress;
    this.tokenFactory = dependencies.tokenFactory ?? (() => randomBytes(32).toString('base64url'));
    this.ttlMs = dependencies.ttlMs ?? defaultPairingTtlMs;
  }

  getStatus(): MobilePairingServerStatus {
    return { ...this.status };
  }

  onStatus(listener: StatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<MobilePairingServerStatus> {
    if (this.status.state === 'running' || this.status.state === 'starting') {
      return this.getStatus();
    }

    this.setStatus({ state: 'starting' });

    const lanAddress = this.resolveLanAddress();
    if (!lanAddress) {
      const status: MobilePairingServerStatus = {
        state: 'error',
        errorMessage: '同一LANで利用できるプライベートIPv4アドレスが見つかりません。'
      };
      this.setStatus(status);
      return status;
    }

    this.token = this.tokenFactory();
    this.expiresAt = this.now() + this.ttlMs;
    this.requestRates.clear();

    try {
      const server = createServer((request, response) => {
        void this.handleRequest(request, response);
      });
      server.maxConnections = 4;
      server.requestTimeout = 5_000;
      server.headersTimeout = 5_000;

      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '0.0.0', () => {
          server.off('error', reject);
          resolve();
        });
      });

      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        throw new Error('ローカルAPIのポートを取得できませんでした。');
      }

      this.server = server;
      const baseUrl = `http://${lanAddress}:${address.port}`;
      const pairingUri = createMobilePairingUri({
        baseUrl,
        token: this.token,
        expiresAt: this.expiresAt
      });

      this.expiryTimer = setTimeout(() => {
        void this.stop();
      }, this.ttlMs);
      this.expiryTimer.unref?.();

      const status: MobilePairingServerStatus = {
        state: 'running',
        baseUrl,
        pairingUri,
        expiresAt: this.expiresAt
      };
      this.setStatus(status);
      return status;
    } catch (error) {
      await this.stop();
      const status: MobilePairingServerStatus = {
        state: 'error',
        errorMessage: error instanceof Error ? error.message : 'ローカルInspector APIを開始できませんでした。'
      };
      this.setStatus(status);
      return status;
    }
  }

  async stop(): Promise<MobilePairingServerStatus> {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = undefined;
    }

    const currentServer = this.server;
    this.server = undefined;
    this.token = undefined;
    this.expiresAt = undefined;
    this.requestRates.clear();

    if (currentServer) {
      await new Promise<void>((resolve) => {
        currentServer.close(() => resolve());
        currentServer.closeAllConnections?.();
      });
    }

    const status: MobilePairingServerStatus = { state: 'stopped' };
    this.setStatus(status);
    return status;
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    setSecurityHeaders(response);

    const remoteAddress = normalizeRemoteAddress(request.socket.remoteAddress);
    if (!remoteAddress || !isPrivateOrLoopbackAddress(remoteAddress)) {
      sendJson(response, 403, { error: 'forbidden' });
      return;
    }

    if (!this.consumeRateLimit(remoteAddress)) {
      sendJson(response, 429, { error: 'too_many_requests' });
      return;
    }

    const requestUrl = parseRequestUrl(request.url);
    if (request.method !== 'GET' || requestUrl.pathname !== snapshotPath) {
      sendJson(response, 404, { error: 'not_found' });
      return;
    }

    if (!this.token || !this.expiresAt || this.expiresAt <= this.now()) {
      sendJson(response, 401, { error: 'pairing_expired' });
      return;
    }

    const authorization = request.headers.authorization;
    const receivedToken = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!safeTokenEquals(receivedToken, this.token)) {
      sendJson(response, 401, { error: 'unauthorized' });
      return;
    }

    const payload = this.createPayload();
    if (!payload) {
      sendJson(response, 404, { error: 'workspace_not_found' });
      return;
    }

    const lastAccessAt = this.now();
    this.setStatus({ ...this.status, lastAccessAt });
    response.setHeader('X-Stackpilot-Cursor', payload.cursor);

    const requestedCursor = requestUrl.searchParams.get('cursor');
    if (requestedCursor && requestedCursor === payload.cursor) {
      sendNotModified(response);
      return;
    }

    sendJson(response, 200, payload);
  }

  private createPayload(): MobileInspectorPayload | undefined {
    const snapshot = this.dependencies.getSnapshot();
    const workspace =
      snapshot.workspaces.find((item) => item.id === snapshot.activeWorkspaceId) ?? snapshot.workspaces[0];
    if (!workspace) return undefined;

    const summary = toMobileWorkspaceSummary(workspace);
    const logs = this.dependencies.listLogs(workspace.id).slice(0, 500);

    return {
      workspace: summary,
      logs,
      capturedAt: this.now(),
      cursor: createSnapshotCursor(summary, logs)
    };
  }

  private consumeRateLimit(remoteAddress: string): boolean {
    const now = this.now();
    const current = this.requestRates.get(remoteAddress);
    if (!current || now - current.windowStartedAt >= 60_000) {
      this.requestRates.set(remoteAddress, { count: 1, windowStartedAt: now });
      return true;
    }

    current.count += 1;
    return current.count <= maxRequestsPerMinute;
  }

  private setStatus(status: MobilePairingServerStatus): void {
    this.status = status;
    this.listeners.forEach((listener) => listener(this.getStatus()));
  }
}

export const resolvePrivateLanAddress = (): string | undefined => {
  const candidates = Object.values(networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .filter((address) => address.family === 'IPv4' && !address.internal)
    .map((address) => address.address)
    .filter(isPrivateIpv4Address);

  return candidates[0];
};

export const isPrivateIpv4Address = (address: string): boolean => {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second] = parts;
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
};

export const isPrivateOrLoopbackAddress = (address: string): boolean =>
  address === '127.0.0.1' || address === '::1' || isPrivateIpv4Address(address);

const toMobileWorkspaceSummary = (workspace: Workspace): MobileWorkspaceSummary => ({
  id: workspace.id,
  name: workspace.name,
  environmentType: workspace.environmentType,
  customEnvironmentLabel: workspace.customEnvironmentLabel
});

const createSnapshotCursor = (workspace: MobileWorkspaceSummary, logs: ApiLogEntry[]): string =>
  createHash('sha256')
    .update(
      JSON.stringify({
        workspace,
        logs: logs.map((log) => [
          log.id,
          log.status,
          log.updatedAt ?? log.finishedAt ?? log.startedAt
        ])
      })
    )
    .digest('base64url');

const parseRequestUrl = (value?: string): URL => {
  try {
    return new URL(value ?? '/', 'http://localhost');
  } catch {
    return new URL('http://localhost/invalid');
  }
};

const normalizeRemoteAddress = (address?: string): string | undefined => {
  if (!address) return undefined;
  return address.startsWith('::ffff:') ? address.slice(7) : address;
};

const safeTokenEquals = (received: string, expected: string): boolean => {
  if (!received || received.length !== expected.length) return false;
  const receivedDigest = createHash('sha256').update(received).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();
  return timingSafeEqual(receivedDigest, expectedDigest);
};

const setSecurityHeaders = (response: ServerResponse): void => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Connection', 'close');
};

const sendJson = (response: ServerResponse, statusCode: number, payload: unknown): void => {
  response.statusCode = statusCode;
  response.end(JSON.stringify(payload));
};

const sendNotModified = (response: ServerResponse): void => {
  response.statusCode = 304;
  response.end();
};
