import { useEffect, useMemo, useState } from 'react';
import {
  maxApiLogComparisonTargets,
  selectComparisonLogs
} from '../../shared/domain/apiLogComparison';
import { toPathLabel } from '../../shared/domain/inspector';
import { useAppStore } from '../store/appStore';
import {
  ApiLogComparisonDialog,
  CompareIcon,
  type ApiLogComparisonSaveFeedback
} from './ApiLogComparisonDialog';

export const ApiLogComparisonController = () => {
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const comparisonAutoOpenVersion = useAppStore((state) => state.comparisonAutoOpenVersion);
  const { logs, selectedLogId, comparisonLogIds } = useAppStore((state) => state.inspector);
  const toggleInspectorComparison = useAppStore((state) => state.toggleInspectorComparison);
  const clearInspectorComparison = useAppStore((state) => state.clearInspectorComparison);
  const [isOpen, setIsOpen] = useState(false);
  const [differencesOnly, setDifferencesOnly] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<ApiLogComparisonSaveFeedback>();

  const selectedLog = useMemo(
    () => logs.find((log) => log.id === selectedLogId),
    [logs, selectedLogId]
  );
  const comparisonLogs = useMemo(
    () => selectComparisonLogs(logs, comparisonLogIds),
    [comparisonLogIds, logs]
  );
  const selectedIsCompared = Boolean(
    selectedLog && comparisonLogIds.includes(selectedLog.id)
  );
  const comparisonIsFull = comparisonLogIds.length >= maxApiLogComparisonTargets;

  useEffect(() => {
    setIsOpen(false);
    setDifferencesOnly(false);
    setSaveFeedback(undefined);
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (
      comparisonAutoOpenVersion > 0 &&
      comparisonLogs.length === maxApiLogComparisonTargets
    ) {
      setDifferencesOnly(false);
      setSaveFeedback(undefined);
      setIsOpen(true);
    }
  }, [comparisonAutoOpenVersion, comparisonLogs.length]);

  useEffect(() => {
    if (isOpen && comparisonLogs.length < maxApiLogComparisonTargets) {
      setIsOpen(false);
      setSaveFeedback(undefined);
    }
  }, [comparisonLogs.length, isOpen]);

  const toggleSelectedLog = (): void => {
    if (!selectedLog || isSaving) return;
    toggleInspectorComparison(selectedLog.id);
  };

  const clearComparison = (): void => {
    if (isSaving) return;
    clearInspectorComparison();
    setIsOpen(false);
    setDifferencesOnly(false);
    setSaveFeedback(undefined);
  };

  const closeComparison = (): void => {
    if (isSaving) return;
    setIsOpen(false);
    setSaveFeedback(undefined);
  };

  const saveComparison = async (): Promise<void> => {
    if (
      isSaving ||
      !activeWorkspaceId ||
      comparisonLogs.length !== maxApiLogComparisonTargets
    ) {
      return;
    }

    setIsSaving(true);
    setSaveFeedback(undefined);
    try {
      const result = await window.stackpilot.apiLog.saveComparison({
        workspaceId: activeWorkspaceId,
        leftLogId: comparisonLogs[0].id,
        rightLogId: comparisonLogs[1].id,
        differencesOnly
      });

      if (result.status === 'cancelled') {
        setSaveFeedback({
          kind: 'info',
          message: '比較レポートの保存をキャンセルしました。'
        });
        return;
      }
      if (result.status === 'failed') {
        setSaveFeedback({ kind: 'error', message: result.errorMessage });
        return;
      }

      setSaveFeedback({
        kind: 'success',
        message: `${result.exportedItemCount}項目（差分${result.differenceCount}件）を保存しました。SHA-256: ${result.artifactSha256} 保存先: ${result.filePath}`
      });
    } catch {
      setSaveFeedback({
        kind: 'error',
        message: '比較レポートの保存処理を開始できませんでした。'
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <section
        aria-label="API通信比較操作"
        className="fixed bottom-4 right-4 z-30 w-[392px] max-w-[calc(100vw-2rem)] rounded-xl border border-cyan-900/70 bg-slate-950/95 p-3 shadow-2xl backdrop-blur"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <CompareIcon className="h-4 w-4 text-cyan-300" />
              <h2 className="text-xs font-semibold text-slate-100">API通信比較</h2>
              <span aria-live="polite" className="rounded-full bg-cyan-950 px-2 py-0.5 text-[10px] text-cyan-200">
                {comparisonLogIds.length} / {maxApiLogComparisonTargets}
              </span>
            </div>
            <p className="text-[10px] leading-4 text-slate-500">一覧で通信を選択し、比較A/Bへ追加します。</p>
          </div>
          <button
            type="button"
            disabled={comparisonLogIds.length === 0 || isSaving}
            aria-label="API通信の比較対象をすべて解除"
            className="rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={clearComparison}
          >
            全解除
          </button>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          {[0, 1].map((index) => {
            const log = comparisonLogs[index];
            return (
              <div key={index} className="min-w-0 rounded-lg border border-slate-800 bg-slate-900/70 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold text-cyan-300">比較{index === 0 ? 'A' : 'B'}</span>
                  {log ? (
                    <button
                      type="button"
                      disabled={isSaving}
                      aria-label={`比較${index === 0 ? 'A' : 'B'}から通信を解除`}
                      className="text-[10px] text-slate-500 hover:text-slate-200 disabled:opacity-40"
                      onClick={() => toggleInspectorComparison(log.id)}
                    >
                      解除
                    </button>
                  ) : null}
                </div>
                <p className={`mt-1 truncate text-[11px] ${log ? 'text-slate-200' : 'text-slate-600'}`} title={log?.url}>
                  {log ? toPathLabel(log.url) : '未選択'}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            disabled={!selectedLog || (!selectedIsCompared && comparisonIsFull) || isSaving}
            aria-pressed={selectedIsCompared}
            aria-label={selectedIsCompared ? '選択中の通信を比較対象から解除' : '選択中の通信を比較対象へ追加'}
            className="min-w-0 flex-1 truncate rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={toggleSelectedLog}
          >
            {!selectedLog
              ? '一覧から通信を選択'
              : selectedIsCompared
                ? '選択中を比較から解除'
                : comparisonIsFull
                  ? '比較対象は2件です'
                  : '選択中を比較へ追加'}
          </button>
          <button
            type="button"
            disabled={comparisonLogs.length !== maxApiLogComparisonTargets || isSaving}
            aria-label="選択した2件のAPI通信を比較"
            className="rounded-lg bg-cyan-700 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-600 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
            onClick={() => {
              setSaveFeedback(undefined);
              setIsOpen(true);
            }}
          >
            比較を開く
          </button>
        </div>
      </section>

      {isOpen && comparisonLogs.length === maxApiLogComparisonTargets ? (
        <ApiLogComparisonDialog
          left={comparisonLogs[0]}
          right={comparisonLogs[1]}
          differencesOnly={differencesOnly}
          isSaving={isSaving}
          saveFeedback={saveFeedback}
          onDifferencesOnlyChange={(next) => {
            setDifferencesOnly(next);
            setSaveFeedback(undefined);
          }}
          onSave={() => void saveComparison()}
          onRemove={toggleInspectorComparison}
          onClear={clearComparison}
          onClose={closeComparison}
        />
      ) : null}
    </>
  );
};
