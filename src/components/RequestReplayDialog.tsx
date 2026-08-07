import { useEffect, useMemo, useRef, useState } from 'react';
import type { Workspace } from '../../shared/contracts';
import { environmentLabelMap, isProdEnvironment } from '../../shared/domain/environment';
import { evaluateRequestReplayEligibility } from '../../shared/domain/requestReplay';
import { formatDurationLabel, type NetworkLog } from '../../shared/domain/inspector';

interface RequestReplayDialogProps {
  workspace: Pick<Workspace, 'id' | 'name' | 'environmentType'>;
  log: NetworkLog;
  onClose: () => void;
}

type ReplayFeedback =
  | { kind: 'success'; message: string }
  | { kind: 'info'; message: string }
  | { kind: 'error'; message: string };

export const RequestReplayDialog = ({ workspace, log, onClose }: RequestReplayDialogProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const [isExecuting, setIsExecuting] = useState(false);
  const [feedback, setFeedback] = useState<ReplayFeedback>();
  const eligibility = useMemo(() => evaluateRequestReplayEligibility(log), [log]);
  const isProduction = isProdEnvironment(workspace.environmentType);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isExecuting) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [isExecuting]);

  const executeReplay = async (): Promise<void> => {
    if (!eligibility.replayable || isExecuting) return;
    setIsExecuting(true);
    setFeedback(undefined);
    try {
      const result = await window.stackpilot.apiLog.replay({
        workspaceId: workspace.id,
        logId: log.id
      });
      if (result.status === 'cancelled') {
        setFeedback({ kind: 'info', message: '本番環境の確認でRequest Replayをキャンセルしました。' });
      } else if (result.status === 'failed') {
        setFeedback({ kind: 'error', message: result.errorMessage });
      } else {
        setFeedback({
          kind: 'success',
          message: `再実行しました。HTTP ${result.responseStatus} / ${formatDurationLabel(result.durationMs)}。新しい通信はAPIログ一覧へ追加されます。`
        });
      }
    } catch {
      setFeedback({ kind: 'error', message: 'Request Replayを実行できませんでした。' });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (!isExecuting && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-replay-title"
        aria-describedby="request-replay-description"
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="request-replay-title" className="text-base font-semibold text-slate-100">Request Replay</h2>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] ${isProduction ? 'border-rose-700 bg-rose-950/50 text-rose-200' : 'border-cyan-800 bg-cyan-950/40 text-cyan-200'}`}>
                {environmentLabelMap[workspace.environmentType]}
              </span>
            </div>
            <p id="request-replay-description" className="text-xs text-slate-400">
              元通信を完全複製せず、安全な範囲に限定して現在のWorkspaceタブから再実行します。
            </p>
          </div>
          <button
            type="button"
            autoFocus
            disabled={isExecuting}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40"
            onClick={onClose}
          >
            閉じる
          </button>
        </header>

        <div className="space-y-5 px-5 py-5">
          <section className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-100">{eligibility.method}</span>
              <span className="text-xs text-slate-400">{workspace.name}</span>
            </div>
            <p className="break-all text-xs text-slate-200">{log.url}</p>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-200">再実行時の安全ルール</h3>
            <ul className="list-disc space-y-1 pl-5 text-xs leading-5 text-slate-400">
              <li>元ログのAuthorization、Cookie、custom headerはコピーしません。</li>
              <li>Request bodyは送信しません。GET / HEADだけが対象です。</li>
              <li>現在のブラウザセッションCookieは通常のfetch挙動として送信される可能性があります。</li>
              <li>現在アクティブな同一Workspaceのタブで実行します。</li>
              <li>キャッシュは使用せず、redirectは通常どおり追従します。</li>
            </ul>
          </section>

          {isProduction ? (
            <div className="rounded-lg border border-rose-800/70 bg-rose-950/30 p-3 text-xs leading-5 text-rose-200">
              PROD Workspaceです。「再実行」を押した後、main processのネイティブ確認ダイアログでもう一度確認します。
            </div>
          ) : null}

          {!eligibility.replayable ? (
            <div role="alert" className="rounded-lg border border-amber-800/70 bg-amber-950/30 p-3 text-xs text-amber-200">
              {eligibility.reasonMessage}
            </div>
          ) : null}

          {feedback ? (
            <div
              role={feedback.kind === 'error' ? 'alert' : 'status'}
              aria-live="polite"
              className={`rounded-lg border p-3 text-xs ${feedback.kind === 'success' ? 'border-emerald-800/70 bg-emerald-950/30 text-emerald-200' : feedback.kind === 'error' ? 'border-rose-800/70 bg-rose-950/30 text-rose-200' : 'border-slate-700 bg-slate-900 text-slate-300'}`}
            >
              {feedback.message}
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-800 px-5 py-3">
          <button
            type="button"
            disabled={isExecuting}
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40"
            onClick={onClose}
          >
            キャンセル
          </button>
          <button
            type="button"
            disabled={!eligibility.replayable || isExecuting}
            aria-label="選択したAPI通信を安全に再実行"
            className="rounded-lg bg-cyan-700 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-600 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
            onClick={() => void executeReplay()}
          >
            {isExecuting ? '再実行中…' : isProduction ? '確認して再実行' : '再実行'}
          </button>
        </footer>
      </div>
    </div>
  );
};
