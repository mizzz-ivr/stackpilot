import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  isMobilePairingExpired,
  normalizeMobilePairingConnection,
  type MobilePairingConnection
} from '@stackpilot/shared/domain/mobile-pairing';

const storageKey = 'stackpilot.mobile-pairing.v1';

export async function loadPairingConnection(): Promise<MobilePairingConnection | undefined> {
  const raw = await readStoredValue();
  if (!raw) return undefined;

  try {
    const connection = normalizeMobilePairingConnection(JSON.parse(raw) as MobilePairingConnection);
    if (isMobilePairingExpired(connection)) {
      await clearPairingConnection();
      return undefined;
    }
    return connection;
  } catch {
    await clearPairingConnection();
    return undefined;
  }
}

export async function savePairingConnection(connection: MobilePairingConnection): Promise<void> {
  const value = JSON.stringify(normalizeMobilePairingConnection(connection));
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(storageKey, value);
    return;
  }
  await SecureStore.setItemAsync(storageKey, value);
}

export async function clearPairingConnection(): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.removeItem(storageKey);
    return;
  }
  await SecureStore.deleteItemAsync(storageKey);
}

async function readStoredValue(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return globalThis.localStorage?.getItem(storageKey) ?? null;
  }
  return SecureStore.getItemAsync(storageKey);
}
