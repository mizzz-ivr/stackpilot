import { useEffect } from 'react';
import { WorkspaceSidebar } from './components/WorkspaceSidebar';
import { TopBar } from './components/TopBar';
import { ApiLogPanel } from './components/ApiLogPanel';
import { useAppStore } from './store/appStore';
import { isProdEnvironment } from '../shared/domain/environment';

export const App = () => {
  const load = useAppStore((s) => s.load);
  const activeWorkspace = useAppStore((s) => s.activeWorkspace);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const switchingWorkspaceId = useAppStore((s) => s.switchingWorkspaceId);

  useEffect(() => {
    void load();
  }, [load]);

  const isProd = activeWorkspace ? isProdEnvironment(activeWorkspace.environmentType) : false;
  const activeTab = activeWorkspace?.tabs.find((tab) => tab.id === activeTabId);

  return (
    <div className={`flex h-screen ${isProd ? 'prod-shell' : ''}`}>
      <WorkspaceSidebar />
      <main className="flex flex-1">
        <section className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <section className="flex-1 p-4 text-sm text-slate-400">
            {!activeWorkspace ? (
              <div className="rounded-lg border border-dashed border-slate-700 p-4">Workspace を作成または選択してください。</div>
            ) : switchingWorkspaceId ? (
              <div className="rounded-lg border border-indigo-800/70 bg-indigo-950/30 p-4">Workspace を切り替えています...</div>
            ) : !activeTab ? (
              <div className="rounded-lg border border-rose-800/70 bg-rose-950/30 p-4">アクティブタブが見つかりません。</div>
            ) : (
              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                BrowserView領域: {activeWorkspace.name} / {activeTab.title} ({activeTab.url})
              </div>
            )}
          </section>
        </section>
        <ApiLogPanel />
      </main>
    </div>
  );
};
