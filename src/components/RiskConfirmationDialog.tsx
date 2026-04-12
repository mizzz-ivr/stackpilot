import { buildRiskDialogContent } from '../../shared/domain/risk';
import { useAppStore } from '../store/appStore';

export const RiskConfirmationDialog = () => {
  const riskDialog = useAppStore((s) => s.riskDialog);
  const resolveRiskConfirmation = useAppStore((s) => s.resolveRiskConfirmation);

  if (!riskDialog.isOpen || !riskDialog.currentRequest) return null;

  const request = riskDialog.currentRequest;
  const content = buildRiskDialogContent(request);

  const handleClose = async (allow: boolean) => {
    const resolved = resolveRiskConfirmation(allow ? 'confirmed' : 'canceled');
    if (!resolved) return;
    await window.stackpilot.riskGuard.resolve(resolved.confirmationId, allow);
  };

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
      <div className="w-full max-w-lg rounded-xl border border-rose-500/40 bg-slate-900 shadow-2xl shadow-black/50">
        <header className="border-b border-slate-700/70 px-5 py-4">
          <p className="text-xs font-semibold tracking-[0.15em] text-rose-300">PRODUCTION GUARD</p>
          <h2 className="mt-1 text-base font-semibold text-slate-100">{content.title}</h2>
          <p className="mt-2 text-sm text-slate-300">{content.summary}</p>
        </header>

        <div className="space-y-3 px-5 py-4 text-sm">
          <div className="grid grid-cols-[96px_1fr] gap-2 text-slate-300">
            <span className="text-slate-500">環境</span>
            <span className="font-semibold text-rose-200">{content.environmentLabel}</span>
            <span className="text-slate-500">Method</span>
            <span className="font-semibold text-amber-200">{content.methodLabel}</span>
            <span className="text-slate-500">Path</span>
            <span className="truncate text-slate-200" title={request.url}>
              {content.targetLabel}
            </span>
          </div>
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">{content.caution}</p>
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-700/70 px-5 py-4">
          <button className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200" onClick={() => void handleClose(false)}>
            {content.cancelLabel}
          </button>
          <button className="rounded-md bg-rose-500 px-3 py-1.5 text-sm font-semibold text-white" onClick={() => void handleClose(true)}>
            {content.continueLabel}
          </button>
        </footer>
      </div>
    </div>
  );
};
