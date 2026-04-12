import { useEffect } from 'react';
import { WorkspaceSidebar } from './components/WorkspaceSidebar';
import { TopBar } from './components/TopBar';
import { ApiLogPanel } from './components/ApiLogPanel';
import { useAppStore } from './store/appStore';
import { isProdEnvironment } from '../shared/domain/environment';
import { RiskConfirmationDialog } from './components/RiskConfirmationDialog';

export const App = () => {
  const load = useAppStore((s) => s.load);
  const activeWorkspace = useAppStore((s) => s.activeWorkspace);
  const requestRiskConfirmation = useAppStore((s) => s.requestRiskConfirmation);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const unsubscribe = window.stackpilot.riskGuard.subscribe((request) => {
      const opened = requestRiskConfirmation(request);
      if (!opened) {
        void window.stackpilot.riskGuard.resolve(request.confirmationId, false);
      }
    });

    return unsubscribe;
  }, [requestRiskConfirmation]);

  const isProd = activeWorkspace ? isProdEnvironment(activeWorkspace.environmentType) : false;

  return (
    <div className={`flex h-screen ${isProd ? 'prod-shell' : ''}`}>
      <WorkspaceSidebar />
      <main className="flex flex-1">
        <section className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <section className="flex-1 p-4 text-sm text-slate-400">BrowserView領域はElectron側で描画</section>
        </section>
        <ApiLogPanel />
      </main>
      <RiskConfirmationDialog />
    </div>
  );
};
