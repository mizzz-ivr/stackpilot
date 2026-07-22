import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { MobileInspectorSnapshot } from '@stackpilot/shared/domain/mobile-inspector';
import {
  getMobilePollingDelay,
  nextMobilePollingFailureCount,
  type MobileAutoRefreshState
} from '@stackpilot/shared/domain/mobile-polling';
import {
  isMobilePairingExpired,
  parseMobilePairingUri,
  type MobilePairingConnection
} from '@stackpilot/shared/domain/mobile-pairing';
import {
  createInspectorRepository,
  InspectorRepositoryError,
  type InspectorConnectionMode,
  type InspectorLoadResult,
  type InspectorRepository
} from '@/repositories/inspector-repository';
import {
  clearPairingConnection,
  loadPairingConnection,
  savePairingConnection
} from '@/data/pairing-storage';

export type InspectorLoadStatus = 'loading' | 'ready' | 'error';

export interface InspectorSnapshotState {
  snapshot?: MobileInspectorSnapshot;
  status: InspectorLoadStatus;
  connectionMode: InspectorConnectionMode;
  errorMessage?: string;
  hasPairing: boolean;
  autoRefreshState: MobileAutoRefreshState;
  nextRefreshDelayMs?: number;
  lastCheckedAt?: number;
  lastUpdatedAt?: number;
  reload: () => Promise<void>;
  pair: (pairingUri: string) => Promise<void>;
  disconnect: () => Promise<void>;
}

type LoadOptions = {
  showLoading: boolean;
  preserveSnapshotOnError: boolean;
};

export const useInspectorSnapshot = (): InspectorSnapshotState => {
  const [pairingConnection, setPairingConnection] = useState<MobilePairingConnection>();
  const [isInitialized, setIsInitialized] = useState(false);
  const [appStateStatus, setAppStateStatus] = useState<AppStateStatus>(AppState.currentState ?? 'active');
  const repository = useMemo(() => createInspectorRepository(pairingConnection), [pairingConnection]);
  const [snapshot, setSnapshot] = useState<MobileInspectorSnapshot>();
  const [status, setStatus] = useState<InspectorLoadStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string>();
  const [autoRefreshState, setAutoRefreshState] = useState<MobileAutoRefreshState>('disabled');
  const [nextRefreshDelayMs, setNextRefreshDelayMs] = useState<number>();
  const [lastCheckedAt, setLastCheckedAt] = useState<number>();
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number>();
  const cursorRef = useRef<string | undefined>(undefined);
  const requestSequenceRef = useRef(0);
  const failureCountRef = useRef(0);
  const autoRefreshStoppedRef = useRef(false);

  const loadFrom = useCallback(async (
    target: InspectorRepository,
    cursor: string | undefined,
    options: LoadOptions
  ): Promise<InspectorLoadResult> => {
    const requestId = ++requestSequenceRef.current;
    if (options.showLoading) {
      setStatus('loading');
      setErrorMessage(undefined);
    }

    try {
      const result = await target.loadSnapshot(cursor);
      if (requestId === requestSequenceRef.current) {
        const checkedAt = Date.now();
        setLastCheckedAt(checkedAt);
        if (result.kind === 'updated') {
          cursorRef.current = result.snapshot.cursor;
          setSnapshot(result.snapshot);
          setLastUpdatedAt(checkedAt);
        } else if (result.cursor) {
          cursorRef.current = result.cursor;
        }
        setStatus('ready');
        setErrorMessage(undefined);
      }
      return result;
    } catch (error) {
      if (requestId === requestSequenceRef.current) {
        if (!options.preserveSnapshotOnError) setSnapshot(undefined);
        setStatus('error');
        setErrorMessage(error instanceof Error ? error.message : 'Inspectorデータの取得に失敗しました。');
      }
      throw error;
    }
  }, []);

  const reload = useCallback(async () => {
    try {
      await loadFrom(repository, undefined, {
        showLoading: true,
        preserveSnapshotOnError: true
      });
      failureCountRef.current = 0;
      autoRefreshStoppedRef.current = false;
      if (repository.mode !== 'demo' && appStateStatus === 'active') {
        setAutoRefreshState('active');
        setNextRefreshDelayMs(getMobilePollingDelay(0));
      }
    } catch (error) {
      if (isPairingExpiredError(error)) {
        autoRefreshStoppedRef.current = true;
        setAutoRefreshState('stopped');
        setNextRefreshDelayMs(undefined);
      }
      throw error;
    }
  }, [appStateStatus, loadFrom, repository]);

  const pair = useCallback(async (pairingUri: string) => {
    const connection = parseMobilePairingUri(pairingUri);
    if (isMobilePairingExpired(connection)) {
      throw new Error('QRコードの有効期限が切れています。Desktopで再発行してください。');
    }

    const pairedRepository = createInspectorRepository(connection);
    await loadFrom(pairedRepository, undefined, {
      showLoading: true,
      preserveSnapshotOnError: false
    });
    await savePairingConnection(connection);
    failureCountRef.current = 0;
    autoRefreshStoppedRef.current = false;
    setPairingConnection(connection);
  }, [loadFrom]);

  const disconnect = useCallback(async () => {
    requestSequenceRef.current += 1;
    await clearPairingConnection();
    cursorRef.current = undefined;
    failureCountRef.current = 0;
    autoRefreshStoppedRef.current = false;
    setPairingConnection(undefined);
    setSnapshot(undefined);
    setStatus('loading');
    setErrorMessage(undefined);
    setLastCheckedAt(undefined);
    setLastUpdatedAt(undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadPairingConnection().then((connection) => {
      if (!cancelled) {
        setPairingConnection(connection);
        setIsInitialized(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppStateStatus);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    cursorRef.current = undefined;
    failureCountRef.current = 0;
    autoRefreshStoppedRef.current = false;
  }, [repository]);

  useEffect(() => {
    if (!isInitialized || repository.mode !== 'demo') return;
    setAutoRefreshState('disabled');
    setNextRefreshDelayMs(undefined);
    void loadFrom(repository, undefined, {
      showLoading: true,
      preserveSnapshotOnError: false
    }).catch(() => undefined);
  }, [isInitialized, loadFrom, repository]);

  useEffect(() => {
    if (!isInitialized || repository.mode === 'demo') return;

    if (appStateStatus !== 'active') {
      setAutoRefreshState('paused');
      setNextRefreshDelayMs(undefined);
      return;
    }

    if (autoRefreshStoppedRef.current) {
      setAutoRefreshState('stopped');
      setNextRefreshDelayMs(undefined);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = (delayMs: number) => {
      if (cancelled) return;
      setNextRefreshDelayMs(delayMs);
      timer = setTimeout(() => {
        void poll();
      }, delayMs);
    };

    const poll = async (): Promise<void> => {
      try {
        await loadFrom(repository, cursorRef.current, {
          showLoading: cursorRef.current === undefined,
          preserveSnapshotOnError: true
        });
        if (cancelled) return;
        failureCountRef.current = 0;
        setAutoRefreshState('active');
        schedule(getMobilePollingDelay(0));
      } catch (error) {
        if (cancelled) return;
        if (isPairingExpiredError(error)) {
          autoRefreshStoppedRef.current = true;
          setAutoRefreshState('stopped');
          setNextRefreshDelayMs(undefined);
          return;
        }

        const delayMs = getMobilePollingDelay(failureCountRef.current);
        failureCountRef.current = nextMobilePollingFailureCount(failureCountRef.current);
        setAutoRefreshState('backoff');
        schedule(delayMs);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [appStateStatus, isInitialized, loadFrom, repository]);

  return {
    snapshot,
    status,
    connectionMode: repository.mode,
    errorMessage,
    hasPairing: Boolean(pairingConnection),
    autoRefreshState,
    nextRefreshDelayMs,
    lastCheckedAt,
    lastUpdatedAt,
    reload,
    pair,
    disconnect
  };
};

const isPairingExpiredError = (error: unknown): boolean =>
  error instanceof InspectorRepositoryError && error.code === 'pairing-expired';
