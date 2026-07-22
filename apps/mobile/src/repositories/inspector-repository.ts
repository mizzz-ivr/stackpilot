import { fetch } from 'expo/fetch';
import {
  isMobileInspectorPayload,
  toMobileInspectorSnapshot,
  type MobileInspectorSnapshot
} from '@stackpilot/shared/domain/mobile-inspector';
import type { MobilePairingConnection } from '@stackpilot/shared/domain/mobile-pairing';
import { demoInspectorSnapshot } from '@/data/demo-inspector';

export type InspectorConnectionMode = 'demo' | 'remote' | 'paired';

export interface InspectorRepository {
  readonly mode: InspectorConnectionMode;
  loadSnapshot(): Promise<MobileInspectorSnapshot>;
}

class DemoInspectorRepository implements InspectorRepository {
  readonly mode = 'demo' as const;

  async loadSnapshot(): Promise<MobileInspectorSnapshot> {
    return demoInspectorSnapshot;
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

  async loadSnapshot(): Promise<MobileInspectorSnapshot> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(`${this.baseUrl}/v1/mobile/inspector/snapshot`, {
        headers: {
          accept: 'application/json',
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {})
        },
        signal: controller.signal
      });

      if (response.status === 401) {
        throw new Error('ペアリングの有効期限が切れています。Desktopで再接続してください。');
      }

      if (!response.ok) {
        throw new Error(`Inspector API returned ${response.status}`);
      }

      const payload: unknown = await response.json();
      if (!isMobileInspectorPayload(payload)) {
        throw new Error('Inspector API response is invalid');
      }

      return toMobileInspectorSnapshot(payload);
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
