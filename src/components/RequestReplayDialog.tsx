import { useEffect, useMemo, useRef, useState } from 'react';
import type { Workspace } from '../../shared/contracts';
import { environmentLabelMap, isProdEnvironment } from '../../shared/domain/environment';
import {
  createRequestReplayTargetUrl,
  evaluateRequestReplayEligibility,
  parseRequestReplayQueryEntries,
  requestReplayQueryLimits,
  validateRequestReplayQueryEntries,
  type RequestReplayQueryEntry
} from '../../shared/domain/requestReplay';
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

type QueryDraftEntry = RequestReplayQueryEntry & {
  id: string;
  original?: RequestReplayQueryEntry;
};

export const RequestReplayDialog = ({ workspace, log, onClose }: RequestReplayDialogProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const isExecutingRef = useRef(false);
  const addedEntrySequenceRef = useRef(0);
  const [isExecuting, setIsExecuting] = useState(false);
  const [feedback, setFeedback] = useState<ReplayFeedback>();
  const [queryDraft, setQueryDraft] = useState<QueryDraftEntry[]>(() => createQueryDraft(log.url));
  const eligibility = useMemo(() => evaluateRequestReplayEligibility(log), [log]);
  const isProduction = isProdEnvironment(workspace.environmentType);
  const queryEntries = useMemo<RequestReplayQueryEntry[]>(
    () => queryDraft.map(({ name, value }) => ({ name, value })),
    [queryDraft]
  );
  const queryValidation = useMemo(
    () => validateRequestReplayQueryEntries(queryEntries),
    [queryEntries]
  );
  const targetUrl = useMemo(() => {
    try {
      return createRequestReplayTargetUrl(log.url, queryEntries);
    } catch {
      return log.url;
    }
  }, [log.url, queryEntries]);
  const queryDiff = useMemo(() => summarizeQueryDiff(queryDraft, log.url), [log.url, queryDraft]);
  const canExecute = eligibility.replayable && queryValidation.valid && !isExecuting;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    isExecutingRef.current = isExecuting;
  }, [isExecuting]);

  useEffect(() => {
    setQueryDraft(createQueryDraft(log.url));
    setFeedback(undefined);
    addedEntrySequenceRef.current = 0;
  }, [log.id, log.url]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isExecutingRef.current) {
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
  }, []);

  const updateQueryEntry = (id: string, patch: Partial<RequestReplayQueryEntry>): void => {
    if (isExecutingRef.current) return;
    setQueryDraft((current) => current.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
    setFeedback(undefined);
  };

  const addQueryEntry = (): void => {
    if (isExecutingRef.current || queryDraft.length >= requestReplayQueryLimits.maxEntries) return;
    const id = `added-${addedEntrySequenceRef.current++}`;
    setQueryDraft((current) => [...current, { id, name: '', value: '' }]);
    setFeedback(undefined);
  };

  const removeQueryEntry = (id: string): void => {
    if (isExecutingRef.current) return;
    setQueryDraft((current) => current.filter((entry) => entry.id !== id));
    setFeedback(undefined);
  };

  const resetQuery = (): void => {
    if (isExecutingRef.current) return;
    setQueryDraft(createQueryDraft(log.url));
    setFeedback(undefined);
    addedEntrySequenceRef.current = 0;
  };

  const executeReplay = async (): Promise<void> => {
    if (!eligibility.replayable || !queryValidation.valid || isExecutingRef.current) return;
    isExecutingRef.current = true;
    setIsExecuting(true);
    setFeedback(undefined);
    try {
      const result = await window.stackpilot.apiLog.replay({
        workspaceId: workspace.id,
        logId: log.id,
        queryEntries
      });
      if (result.status === 'cancelled') {
        setFeedback({ kind: 'info', message: '本番環境の確認でRequest Replayをキャンセルしました。' });
      } else if (result.status === 'failed') {
        setFeedback({ kind: 'error', message: result.errorMessage });
      } else {
        const changeLabel = queryDiff.total > 0 ? ` Query変更${queryDiff.total}件を適用しました。` : '';
        setFeedback({
          kind: 'success',
          message: `再実行しました。HTTP ${result.responseStatus} / ${formatDurationLabel(result.durationMs)}。${changeLabel} 新しい通信はAPIログ一覧へ追加されます。`
        });
      }
    } catch {
      setFeedback({ kind: 'error', message: 'Request Replayを実行できませんでした。' });
    } finally {
      isExecutingRef.current = false;
      setIsExecuting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (!isExecutingRef.current && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-replay-title"
        aria-describedby="request-replay-description"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="request-replay-title" className="text-base font-semibold text-slate-100">Request Replay</h2>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] ${isProduction ? 'border-rose-700 bg-rose-950/50 text-rose-200' : 'border-cyan-800 bg-cyan-950/40 text-cyan-200'}`}>
                {environmentLabelMap[workspace.environmentType]}
              </span>
            </div>
            <p id="request-replay-description" className="text-xs text-slate-400">
              originとpathを固定し、queryだけを編集して安全な範囲で再実行します。
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

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <section className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-100">{eligibility.method}</span>
              <span className="text-xs text-slate-400">{workspace.name}</span>
            </div>
            <div className="space-y-1 text-xs">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">元URL</p>
              <p className="break-all text-slate-300">{log.url}</p>
              <p className="pt-1 text-[10px] font-medium uppercase tracking-wide text-cyan-500">Replay URL</p>
              <p className="break-all text-cyan-200" aria-label="Replay URL">{targetUrl}</p>
            </div>
          </section>

          {eligibility.replayable ? (
            <section className="space-y-3" aria-label="Query editor">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-semibold text-slate-200">Query editor</h3>
                  <p className="mt-1 text-[11px] text-slate-500">
                    origin / pathは変更できません。同名parameterと空値は別行のまま保持します。
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isExecuting || queryDiff.total === 0}
                    className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                    onClick={resetQuery}
                  >
                    元のqueryに戻す
                  </button>
                  <button
                    type="button"
                    disabled={isExecuting || queryDraft.length >= requestReplayQueryLimits.maxEntries}
                    className="rounded border border-cyan-800 bg-cyan-950/40 px-2 py-1 text-[11px] text-cyan-200 hover:bg-cyan-900/40 disabled:opacity-40"
                    onClick={addQueryEntry}
                  >
                    Query parameterを追加
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-center text-[11px]">
                <div><span className="text-slate-500">追加</span><strong className="ml-2 text-emerald-300">{queryDiff.added}</strong></div>
                <div><span className="text-slate-500">変更</span><strong className="ml-2 text-amber-300">{queryDiff.changed}</strong></div>
                <div><span className="text-slate-500">削除</span><strong className="ml-2 text-rose-300">{queryDiff.removed}</strong></div>
              </div>

              {queryDraft.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-800 px-3 py-4 text-center text-xs text-slate-500">
                  Query parameterはありません。必要な場合は追加してください。
                </div>
              ) : (
                <div className="space-y-2">
                  {queryDraft.map((entry, index) => (
                    <div key={entry.id} className="grid grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)_auto] gap-2">
                      <input
                        aria-label={`Query名 ${index + 1}`}
                        value={entry.name}
                        disabled={isExecuting}
                        maxLength={requestReplayQueryLimits.maxNameLength + 1}
                        className="min-w-0 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-cyan-600 disabled:opacity-50"
                        placeholder="name"
                        onChange={(event) => updateQueryEntry(entry.id, { name: event.target.value })}
                      />
                      <input
                        aria-label={`Query値 ${index + 1}`}
                        value={entry.value}
                        disabled={isExecuting}
                        maxLength={requestReplayQueryLimits.maxValueLength + 1}
                        className="min-w-0 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-cyan-600 disabled:opacity-50"
                        placeholder="value"
                        onChange={(event) => updateQueryEntry(entry.id, { value: event.target.value })}
                      />
                      <button
                        type="button"
                        aria-label={`Query parameter ${index + 1}を削除`}
                        disabled={isExecuting}
                        className="rounded border border-slate-700 px-2 py-1.5 text-[11px] text-slate-400 hover:border-rose-800 hover:text-rose-300 disabled:opacity-40"
                        onClick={() => removeQueryEntry(entry.id)}
                      >
                        削除
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[10px] leading-4 text-slate-500">
                最大{requestReplayQueryLimits.maxEntries}件 / Query名{requestReplayQueryLimits.maxNameLength}文字 / 値{requestReplayQueryLimits.maxValueLength}文字 / URLエンコード後{requestReplayQueryLimits.maxSerializedLength}文字まで
              </p>

              {!queryValidation.valid ? (
                <div role="alert" className="rounded-lg border border-amber-800/70 bg-amber-950/30 p-3 text-xs text-amber-200">
                  {queryValidation.errorMessage}
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-200">再実行時の安全ルール</h3>
            <ul className="list-disc space-y-1 pl-5 text-xs leading-5 text-slate-400">
              <li>元ログのAuthorization、Cookie、custom headerはコピーしません。</li>
              <li>Request bodyは送信しません。GET / HEADだけが対象です。</li>
              <li>originとpathは元ログからmain processが再構築し、queryだけを編集できます。</li>
              <li>URL fragmentはReplay時に除去します。</li>
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

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-800 px-5 py-3">
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
            disabled={!canExecute}
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

const createQueryDraft = (sourceUrl: string): QueryDraftEntry[] => {
  try {
    return parseRequestReplayQueryEntries(sourceUrl).map((entry, index) => ({
      ...entry,
      id: `original-${index}`,
      original: { ...entry }
    }));
  } catch {
    return [];
  }
};

const summarizeQueryDiff = (draft: QueryDraftEntry[], sourceUrl: string) => {
  const originalEntries = createQueryDraft(sourceUrl);
  const originalIds = new Set(originalEntries.map((entry) => entry.id));
  const currentOriginalIds = new Set(draft.filter((entry) => entry.original).map((entry) => entry.id));
  const added = draft.filter((entry) => !entry.original).length;
  const removed = [...originalIds].filter((id) => !currentOriginalIds.has(id)).length;
  const changed = draft.filter((entry) =>
    entry.original && (entry.name !== entry.original.name || entry.value !== entry.original.value)
  ).length;
  return { added, removed, changed, total: added + removed + changed };
};
