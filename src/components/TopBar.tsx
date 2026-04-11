import { useEffect, useMemo, useState } from 'react';
import { EnvironmentBadge } from './EnvironmentBadge';
import { useAppStore } from '../store/appStore';
import { getSafetyLevelByEnvironment, safetyDialogMessage } from '../../shared/domain/safety';

export const TopBar = () => {
  const navigate = useAppStore((s) => s.navigate);
  const openDevTools = useAppStore((s) => s.openDevTools);
  const activeWorkspace = useAppStore((s) => s.activeWorkspace);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const [url, setUrl] = useState('https://example.com');

  const activeTab = activeWorkspace?.tabs.find((tab) => tab.id === activeTabId);

  useEffect(() => {
    if (activeTab?.url) {
      setUrl(activeTab.url);
    }
  }, [activeTab?.id, activeTab?.url]);

  const safetyLevel = useMemo(
    () => (activeWorkspace ? getSafetyLevelByEnvironment(activeWorkspace.environmentType) : 'normal'),
    [activeWorkspace]
  );

  const showProdWarning = safetyLevel === 'danger';

  return (
    <header className={`flex h-[112px] flex-col gap-2 border-b px-4 py-3 ${showProdWarning ? 'border-rose-700/80' : 'border-slate-800'}`}>
      <div className="flex items-center gap-2">
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          className="flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2"
        />
        <button className="rounded bg-indigo-600 px-4 py-2" onClick={() => void navigate(url)}>
          Go
        </button>
        <button className="rounded bg-slate-700 px-4 py-2" onClick={() => void openDevTools()}>
          DevTools
        </button>
        {activeWorkspace ? <EnvironmentBadge environmentType={activeWorkspace.environmentType} /> : null}
      </div>
      {activeWorkspace ? (
        <div
          className={`rounded px-3 py-1 text-xs ${
            showProdWarning ? 'bg-rose-950/70 text-rose-200' : 'bg-slate-800 text-slate-300'
          }`}
        >
          {safetyDialogMessage[safetyLevel]}
        </div>
      ) : null}
    </header>
  );
};
