import { useEffect, useMemo, useRef, useState } from 'react';
import {
  appendApiInspectorRunHistory,
  canCompareApiInspectorRunHistoryEntry,
  clearApiInspectorRunHistory,
  parseApiInspectorRunQueryEntries,
  selectApiInspectorRunHistory,
  type ApiInspectorRunHistoryEntry
} from '../../shared/domain/apiInspectorRunHistory';
import { formatDurationLabel, toPathLabel } from '../../shared/domain/inspector';
import { evaluateRequestReplayEligibility } from '../../shared/domain/requestReplay';
import { useAppStore } from '../store/appStore';
import { RequestReplayDialog } from './RequestReplayDialog';

export const ApiInspectorRunHistoryController = () => {
  const activeWorkspace = useAppStore((state) => state.activeWorkspace);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const comparisonAutoOpenVersion = useAppStore((state) => state.comparisonAutoOpenVersion);
  const { logs, comparisonLogIds } = useAppStore((state) => state.inspector);
  const clearInspectorComparison = useAppStore((state) => state.clearInspectorComparison);
  const toggleInspectorComparison = useAppStore((state) => state.toggleInspectorComparison);
  const lastRecordedVersionRef = useRef(0);
  const [history, setHistory] = useState<ApiInspectorRunHistoryEntry[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [replayHistoryEntry, setReplayHistoryEntry] = useState<ApiInspectorRunHistoryEntry>();

  const workspaceHistory = useMemo(
    () => selectApiInspectorRunHistory(history, activeWorkspaceId),
    [activeWorkspaceId, history]
  );
  const comparisonLogs = useMemo(() => {
    const logById = new Map(logs.map((log) => [log.id, log]));
    return comparisonLogIds
      .map((logId) => logById.get(logId))
      .filter((log): log is NonNullable<typeof log> => Boolean(log));
  }, [comparisonLogIds, logs]);
  const replaySourceLog = useMemo(
    () => replayHistoryEntry
      ? logs.find((log) => log.id === replayHistoryEntry.sourceLogId)
      : undefined,
    [logs, replayHistoryEntry]
  );

  useEffect(() => {
    setExpanded(false);
    setReplayHistoryEntry(undefined);
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (replayHistoryEntry && !replaySourceLog) setReplayHistoryEntry(undefined);
  }, [replayHistoryEntry, replaySourceLog]);

  useEffect(() => {
    if (
      comparisonAutoOpenVersion <= 0 ||
      comparisonAutoOpenVersion <= lastRecordedVersionRef.current ||
      !activeWorkspaceId ||
      comparisonLogs.length !== 2
    ) {
      return;
    }

    const [sourceLog, resultLog] = comparisonLogs;
    if (
      sourceLog.workspaceId !== activeWorkspaceId ||
      resultLog.workspaceId !== activeWorkspaceId ||
      sourceLog.id === resultLog.id
    ) {
      return;
    }

    setHistory((current) => appendApiInspectorRunHistory(current, {
      id: `${activeWorkspaceId}:${comparisonAutoOpenVersion}:${resultLog.id}`,
      workspaceId: activeWorkspaceId,
      sourceLogId: sourceLog.id,
      resultLogId: resultLog.id,
      method: resultLog.method,
      targetUrl: resultLog.url,
      queryEntries: parseApiInspectorRunQueryEntries(resultLog.url),
      responseStatus: resultLog.status,
      durationMs: resultLog.durationMs,
      executedAt: resultLog.startedAt
    }));
    lastRecordedVersionRef.current = comparisonAutoOpenVersion;
  }, [activeWorkspaceId, comparisonAutoOpenVersion, comparisonLogs]);

  const restoreComparison = (entry: ApiInspectorRunHistoryEntry): void => {
    if (!entry.resultLogId || !canCompareApiInspectorRunHistoryEntry(entry, logs)) return;
    clearInspectorComparison();
    toggleInspectorComparison(entry.sourceLogId);
    toggleInspectorComparison(entry.resultLogId);
    setExpanded(false);
  };

  const restoreReplayPreview = (entry: ApiInspectorRunHistoryEntry): void => {
    const sourceLog = logs.find((log) => log.id === entry.sourceLogId);
    if (!sourceLog || !evaluateRequestReplayEligibility(sourceLog).replayable) return;
    setReplayHistoryEntry(entry);
  };

  const clearWorkspaceHistory = (): void => {
    if (!activeWorkspaceId) return;
    setHistory((current) => clearApiInspectorRunHistory(current, activeWorkspaceId));
  };

  return (
    <>
      <section
        aria-label="API Inspector実行履歴"
        className="fixed bottom-52 right-4 z-30 w-[392px] max-w-[calc(100vw-2rem)] rounded-xl border border-slate-800 bg-slate-950/95 p-2.5 shadow-xl backdrop-blur"
      >
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label={expanded ? '再実行履歴を閉じる' : '再実行履歴を開く'}
            aria-expanded={expanded}
            aria-controls="api-inspector-run-history"
            className="flex min-w-0 items-center gap-2 text-left text-xs font-semibold text-slate-200 hover:text-white"
            onClick={() => setExpanded((current) => !current)}
          >
            <span>{expanded ? '▾' : '▸'}</span>
            <span>再実行履歴</span>
            <span aria-live="polite" className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
              {workspaceHistory.length}
            </span>
          </button>
          <button
            type="button"
            disabled={workspaceHistory.length === 0}
            aria-label="現在のWorkspaceの再実行履歴をクリア"
            className="rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-800 hover:text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={clearWorkspaceHistory}
          >
            クリア
          </button>
        </div>

        {expanded ? (
          <div
            id="api-inspector-run-history"
            role="region"
            aria-label="再実行履歴"
            className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1"
          >
            {workspaceHistory.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-800 px-3 py-3 text-[10px] leading-4 text-slate-500">
                このWorkspaceでは再実行結果をまだ捕捉していません。
              </p>
            ) : (
              workspaceHistory.map((entry) => {
                const comparisonAvailable = canCompareApiInspectorRunHistoryEntry(entry, logs);
                const sourceLog = logs.find((log) => log.id === entry.sourceLogId);
                const replayEligibility = sourceLog
                  ? evaluateRequestReplayEligibility(sourceLog)
                  : undefined;
                const replayAvailable = Boolean(sourceLog && replayEligibility?.replayable);

                return (
                  <div key={entry.id} className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5">
                    <div className="flex min-w-0 flex-wrap items-center gap-2 text-[10px]">
                      <span className="font-semibold text-cyan-300">{entry.method.toUpperCase()}</span>
                      <span className="text-slate-300">HTTP {entry.responseStatus ?? '—'}</span>
                      <span className="text-slate-500">{formatDurationLabel(entry.durationMs)}</span>
                      <span className="text-slate-600">{formatHistoryTime(entry.executedAt)}</span>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-slate-200" title={entry.targetUrl}>
                      {toPathLabel(entry.targetUrl)}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                        <span>Query {entry.queryEntries.length}件</span>
                        {!sourceLog ? <span className="text-amber-400/80">元ログ保持外</span> : null}
                        {sourceLog && !replayAvailable ? <span className="text-amber-400/80">再実行対象外</span> : null}
                        {!comparisonAvailable ? <span className="text-amber-400/80">比較ログ保持外</span> : null}
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={!replayAvailable}
                          aria-label="履歴のQuery条件をRequest Replayへ復元"
                          className="shrink-0 rounded border border-indigo-800/70 px-2 py-1 text-[10px] text-indigo-200 hover:bg-indigo-950/50 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
                          onClick={() => restoreReplayPreview(entry)}
                        >
                          この条件で再実行
                        </button>
                        <button
                          type="button"
                          disabled={!comparisonAvailable}
                          aria-label="履歴の元通信と結果通信を比較対象へ復元"
                          className="shrink-0 rounded border border-cyan-800/70 px-2 py-1 text-[10px] text-cyan-200 hover:bg-cyan-950/50 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
                          onClick={() => restoreComparison(entry)}
                        >
                          比較へ復元
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <p className="text-[9px] leading-4 text-slate-600">
              Workspaceごとに最大20件、このアプリ実行中のメモリだけに保持します。
            </p>
          </div>
        ) : null}
      </section>

      {replayHistoryEntry && replaySourceLog && activeWorkspace && replaySourceLog.workspaceId === activeWorkspace.id ? (
        <RequestReplayDialog
          workspace={activeWorkspace}
          log={replaySourceLog}
          initialQueryEntries={replayHistoryEntry.queryEntries}
          onClose={() => setReplayHistoryEntry(undefined)}
        />
      ) : null}
    </>
  );
};

const formatHistoryTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
