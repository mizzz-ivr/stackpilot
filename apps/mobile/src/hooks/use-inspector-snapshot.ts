import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MobileInspectorSnapshot } from '@stackpilot/shared/domain/mobile-inspector';
import {
  createInspectorRepository,
  type InspectorConnectionMode
} from '@/repositories/inspector-repository';

export type InspectorLoadStatus = 'loading' | 'ready' | 'error';

export interface InspectorSnapshotState {
  snapshot?: MobileInspectorSnapshot;
  status: InspectorLoadStatus;
  connectionMode: InspectorConnectionMode;
  errorMessage?: string;
  reload: () => Promise<void>;
}

export const useInspectorSnapshot = (): InspectorSnapshotState => {
  const repository = useMemo(() => createInspectorRepository(), []);
  const [snapshot, setSnapshot] = useState<MobileInspectorSnapshot>();
  const [status, setStatus] = useState<InspectorLoadStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string>();

  const reload = useCallback(async () => {
    setStatus('loading');
    setErrorMessage(undefined);

    try {
      const nextSnapshot = await repository.loadSnapshot();
      setSnapshot(nextSnapshot);
      setStatus('ready');
    } catch (error) {
      setSnapshot(undefined);
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Inspectorデータの取得に失敗しました。');
    }
  }, [repository]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    snapshot,
    status,
    connectionMode: repository.mode,
    errorMessage,
    reload
  };
};
