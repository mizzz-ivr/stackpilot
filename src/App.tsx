import { useEffect } from 'react';
import { WorkspaceSidebar } from './components/WorkspaceSidebar';
import { TopBar } from './components/TopBar';
import { ApiLogPanel } from './components/ApiLogPanel';
import { useAppStore } from './store/appStore';

export const App = () => {
  const load = useAppStore((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex h-screen">
      <WorkspaceSidebar />
      <main className="flex flex-1 flex-col">
        <TopBar />
        <section className="flex-1 p-4 text-sm text-slate-400">BrowserView領域はElectron側で描画</section>
        <ApiLogPanel />
      </main>
    </div>
  );
};
