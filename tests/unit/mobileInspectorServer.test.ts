import { afterEach, describe, expect, it } from 'vitest';
import type { ApiLogEntry, AppSnapshot } from '../../shared/contracts';
import { parseMobilePairingUri } from '../../shared/domain/mobilePairing';
import { MobileInspectorServer } from '../../electron/main/services/mobileInspectorServer';

const workspace = {
  id: 'workspace-1',
  name: 'Development',
  environmentType: 'dev' as const,
  prodDomains: [],
  partitionKey: 'persist:workspace-1',
  tabs: [
    {
      id: 'tab-1',
      title: 'Example',
      url: 'https://example.com',
      isActive: true,
      workspaceId: 'workspace-1'
    }
  ],
  createdAt: '2026-07-22T00:00:00.000Z',
  updatedAt: '2026-07-22T00:00:00.000Z'
};

const log: ApiLogEntry = {
  id: 'log-1',
  workspaceId: workspace.id,
  tabId: 'tab-1',
  type: 'xhr',
  method: 'GET',
  url: 'https://example.com/api/users',
  status: 200,
  durationMs: 42,
  requestHeaders: { accept: 'application/json' },
  responseHeaders: { 'content-type': 'application/json' },
  responseBodySnippet: '{"ok":true}',
  startedAt: 1,
  finishedAt: 43,
  updatedAt: 43
};

const snapshot: AppSnapshot = {
  version: 2,
  activeWorkspaceId: workspace.id,
  activeTabId: 'tab-1',
  workspaces: [workspace]
};

const runningServers: MobileInspectorServer[] = [];

const createRunningServer = async (listLogs: () => ApiLogEntry[]) => {
  const server = new MobileInspectorServer({
    getSnapshot: () => snapshot,
    listLogs,
    resolveLanAddress: () => '192.168.1.20',
    tokenFactory: () => 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
    ttlMs: 60_000
  });
  runningServers.push(server);

  const status = await server.start();
  const pairing = parseMobilePairingUri(status.pairingUri!);
  return {
    server,
    pairing,
    localBaseUrl: pairing.baseUrl.replace('192.168.1.20', '127.0.0.1'),
    headers: { authorization: `Bearer ${pairing.token}` }
  };
};

afterEach(async () => {
  await Promise.all(runningServers.splice(0).map((server) => server.stop()));
});

describe('MobileInspectorServer', () => {
  it('Bearer token必須でactive Workspaceのsnapshotを返す', async () => {
    const { server, localBaseUrl, headers } = await createRunningServer(() => [log]);

    const unauthorized = await fetch(`${localBaseUrl}/v1/mobile/inspector/snapshot`);
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get('cache-control')).toBe('no-store');

    const response = await fetch(`${localBaseUrl}/v1/mobile/inspector/snapshot`, { headers });
    expect(response.status).toBe(200);
    const payload = await response.json() as { cursor: string; workspace: { id: string }; logs: ApiLogEntry[] };
    expect(payload).toMatchObject({
      workspace: { id: workspace.id },
      logs: [{ id: log.id, url: log.url }]
    });
    expect(payload.cursor).toBeTypeOf('string');
    expect(payload.cursor.length).toBeGreaterThan(0);
    expect(response.headers.get('x-stackpilot-cursor')).toBe(payload.cursor);
    expect(server.getStatus().lastAccessAt).toBeTypeOf('number');
  });

  it('同じカーソルなら本文なしの304を返す', async () => {
    const { localBaseUrl, headers } = await createRunningServer(() => [log]);

    const initial = await fetch(`${localBaseUrl}/v1/mobile/inspector/snapshot`, { headers });
    const payload = await initial.json() as { cursor: string };
    const unchanged = await fetch(
      `${localBaseUrl}/v1/mobile/inspector/snapshot?cursor=${encodeURIComponent(payload.cursor)}`,
      { headers }
    );

    expect(unchanged.status).toBe(304);
    expect(await unchanged.text()).toBe('');
    expect(unchanged.headers.get('x-stackpilot-cursor')).toBe(payload.cursor);
    expect(unchanged.headers.get('cache-control')).toBe('no-store');
  });

  it('ログが増えた場合は新しいカーソルで200を返す', async () => {
    let logs: ApiLogEntry[] = [log];
    const { localBaseUrl, headers } = await createRunningServer(() => logs);
    const initial = await fetch(`${localBaseUrl}/v1/mobile/inspector/snapshot`, { headers });
    const firstPayload = await initial.json() as { cursor: string };

    logs = [{ ...log, id: 'log-2', startedAt: 100, finishedAt: 142, updatedAt: 142 }, log];
    const updated = await fetch(
      `${localBaseUrl}/v1/mobile/inspector/snapshot?cursor=${encodeURIComponent(firstPayload.cursor)}`,
      { headers }
    );
    const secondPayload = await updated.json() as { cursor: string; logs: ApiLogEntry[] };

    expect(updated.status).toBe(200);
    expect(secondPayload.cursor).not.toBe(firstPayload.cursor);
    expect(secondPayload.logs[0]?.id).toBe('log-2');
  });

  it('同じログへResponse bodyを反映すると更新時刻でカーソルが変わる', async () => {
    let logs: ApiLogEntry[] = [log];
    const { localBaseUrl, headers } = await createRunningServer(() => logs);
    const initial = await fetch(`${localBaseUrl}/v1/mobile/inspector/snapshot`, { headers });
    const firstPayload = await initial.json() as { cursor: string };

    logs = [
      {
        ...log,
        responseBodySnippet: undefined,
        responseBody: {
          kind: 'json',
          contentType: 'application/json',
          content: '{"ok":true,"access_token":"<redacted>"}',
          byteLength: 48,
          isTruncated: false,
          redactedFieldPaths: ['access_token']
        },
        updatedAt: 100
      }
    ];
    const updated = await fetch(
      `${localBaseUrl}/v1/mobile/inspector/snapshot?cursor=${encodeURIComponent(firstPayload.cursor)}`,
      { headers }
    );
    const secondPayload = await updated.json() as { cursor: string; logs: ApiLogEntry[] };

    expect(updated.status).toBe(200);
    expect(secondPayload.cursor).not.toBe(firstPayload.cursor);
    expect(secondPayload.logs[0]?.responseBody).toMatchObject({
      kind: 'json',
      redactedFieldPaths: ['access_token']
    });
  });

  it('期限切れtokenを拒否する', async () => {
    let now = 1_000;
    const server = new MobileInspectorServer({
      getSnapshot: () => snapshot,
      listLogs: () => [log],
      resolveLanAddress: () => '192.168.1.20',
      tokenFactory: () => 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
      now: () => now,
      ttlMs: 1_000
    });
    runningServers.push(server);

    const status = await server.start();
    const pairing = parseMobilePairingUri(status.pairingUri!);
    const localBaseUrl = pairing.baseUrl.replace('192.168.1.20', '127.0.0.1');
    now = pairing.expiresAt;

    const response = await fetch(`${localBaseUrl}/v1/mobile/inspector/snapshot`, {
      headers: { authorization: `Bearer ${pairing.token}` }
    });
    expect(response.status).toBe(401);
  });

  it('LANアドレスがない場合は起動しない', async () => {
    const server = new MobileInspectorServer({
      getSnapshot: () => snapshot,
      listLogs: () => [],
      resolveLanAddress: () => undefined
    });
    runningServers.push(server);

    await expect(server.start()).resolves.toMatchObject({
      state: 'error'
    });
  });
});
