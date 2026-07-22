import { fetch } from 'expo/fetch';
import {
  isMobileInspectorPayload,
  toMobileInspectorSnapshot,
  type MobileInspectorSnapshot
} from '@stackpilot/shared/domain/mobile-inspector';
import type { MobilePairingConnection } from '@stackpilot/shared/domain/mobile-pairing';
import { demoInspectorSnapshot } from '@/data/demo-inspector';

export type InspectorConnectionMode = 'demo' | 'remote' | 'paired';
export type InspectorRepositoryErrorCode = 'pairing-expired' | 'request-failed' | 'invalid-response' | 'network';

export type InspectorLoadResult =
  | { kind: 'updated'; snapshot: MobileInspectorSnapshot }
  | { kind: 'unchanged'; cursor: string };

export class InspectorRepositoryError extends Error {
  constructor(
    message: string,
    readonly code: InspectorRepositoryErrorCode,
    readonly status?: number
  ) {
    super(message);
    this.name = 'InspectorRepositoryError';
  }
}

export interface InspectorRepository {
  readonly mode: InspectorConnectionMode;
  loadSnapshot(cursor?: string): Promise<InspectorLoadResult>;
}

class DemoInspectorRepository implements InspectorRepository {
  readonly mode = 'demo' as const;

  async loadSnapshot(): Promise<InspectorLoadResult> {
    return { kind: 'updated', snapshot: demoInspectorSnapshot };
  }
}

class HttpInspectorRepository implements InspectorRepository {
  readonly mode: InspectorConnectionMode;

  constructor(
    private readonly baseUrl: string,
    private readonly token?: string,
    mode: InspectorConnectionMode = 'remote'
  ) {
    this.mode = mode;
  }

  async loadSnapshot(cursor?: string): Promise<InspectorLoadResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    const endpoint = new URL(`${this.baseUrl}/v1/mobile/inspector/snapshot`);
    if (cursor) endpoint.searchParams.set('cursor', cursor);

    try {
      const response = await fetch(endpoint.toString(), {
        headers: {
          accept: 'application/json',
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {})
        },
        signal: controller.signal
      });

      if (response.status === 304) {
        return { kind: 'unchanged', cursor: cursor ?? response.headers.get('x-stackpilot-cursor') ?? '' };
      }

      if (response.status === 401) {
        throw new InspectorRepositoryError(
          'ペアリングの有効期限が切れています。Desktopで再接続してください。',
          'pairing-expired',
          401
        );
      }

      if (!response.ok) {
        throw new InspectorRepositoryError(
          `Inspector API returned ${response.status}`,
          'request-failed',
          response.status
        );
      }

      const payload: unknown = await response.json();
      if (!isMobileInspectorPayload(payload)) {
        throw new InspectorRepositoryError('Inspector API response is invalid', 'invalid-response');
      }

      return { kind: 'updated', snapshot: toMobileInspectorSnapshot(payload) };
    } catch (error) {
      if (error instanceof InspectorRepositoryError) throw error;
      throw new InspectorRepositoryError(
        error instanceof Error && error.name === 'AbortError'
          ? 'Inspector APIへの接続がタイムアウトしました。'
          : 'Inspector APIへ接続できませんでした。',
        'network'
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export const createInspectorRepository = (
  pairingConnection?: MobilePairingConnection
): InspectorRepository => {
  if (pairingConnection) {
    return new HttpInspectorRepository(pairingConnection.baseUrl, pairingConnection.token, 'paired');
  }

  const configuredUrl = process.env.EXPO_PUBLIC_STACKPILOT_API_URL?.trim();
  if (!configuredUrl) return new DemoInspectorRepository();

  return new HttpInspectorRepository(configuredUrl.replace(/\/$/, ''));
};
