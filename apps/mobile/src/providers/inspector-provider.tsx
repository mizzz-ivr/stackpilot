import { createContext, use } from 'react';
import type { PropsWithChildren } from 'react';
import {
  useInspectorSnapshot,
  type InspectorSnapshotState
} from '@/hooks/use-inspector-snapshot';

const InspectorContext = createContext<InspectorSnapshotState | null>(null);

export const InspectorProvider = ({ children }: PropsWithChildren) => {
  const state = useInspectorSnapshot();
  return <InspectorContext.Provider value={state}>{children}</InspectorContext.Provider>;
};

export const useInspector = (): InspectorSnapshotState => {
  const context = use(InspectorContext);
  if (!context) {
    throw new Error('useInspector must be used inside InspectorProvider');
  }
  return context;
};
