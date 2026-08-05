import { useEffect, useMemo, useState } from 'react';
import type { ApiLogExportFormat } from '../../shared/domain/apiLogExport';
import {
  emptyApiLogExportCustomMaskingRules,
  parseApiLogExportCustomMaskingRuleText,
  type ApiLogExportCustomMaskingRules
} from '../../shared/domain/apiLogExportCustomMasking';
import type { ApiLogExportPreview } from '../../shared/domain/apiLogExportPreview';
import {
  createPayloadPreview,
  formatDurationLabel,
  formatMethodLabel,
  formatStartedAtLabel,
  getStatusTone,
  toHeaderEntries,
  toPathLabel,
  type HeaderEntry,
  type NetworkLog,
  type PayloadPreview
} from '../../shared/domain/inspector';
import {
  formatRequestBodyUnavailableReason,
  type SafeRequestBodyPreview
} from '../../shared/domain/requestBody';
import {
  formatResponseBodyUnavailableReason,
  type SafeResponseBodyPreview
} from '../../shared/domain/responseBody';
import {
  ApiLogExportPreviewDialog,
  type ApiLogExportFeedback,
  type ApiLogExportMaskingDraft
} from './ApiLogExportPreviewDialog';
import { ApiLogFilterToolbar, PinIcon } from './ApiLogFilterToolbar';
import { selectFilteredLogs, selectSelectedLog, useAppStore } from '../store/appStore';

const HeaderList = ({ entries, emptyLabel }: { entries: HeaderEntry[]; emptyLabel: string }) => {
  if (entries.length === 0) {
    return <p className="text-xs text-slate-500">{emptyLabel}</p>;
  }

  return (
    <dl className="space-y-2">
      {entries.map((entry) => (
        <div key={entry.name} className="grid grid-cols-[minmax(96px,0.35fr)_1fr] gap-2 text-xs">
          <dt className="break-all font-medium text-slate-400">{entry.name}</dt>
          <dd className="break-all text-slate-200">{entry.value}</dd>
        </div>
      ))}
    </dl>
  );
};

const PayloadBlock = ({ preview }: { preview: PayloadPreview }) => {
  if (preview.kind === 'empty') {
    return <p className="text-xs text-slate-500">{preview.content}</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        <span>{preview.kind === 'json' ? 'JSON' : 'Text'}</span>
        {preview.isTruncated ? <span>先頭のみ表示</span> : null}
      </div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-200">
        {preview.content}
      </pre>
    </div>
  );
};

const RequestBodyBlock = ({ requestBody }: { requestBody?: SafeRequestBodyPreview }) => {
  if (!requestBody || requestBody.kind === 'unavailable') {
    return (
      <div className="space-y-1 text-xs text-slate-500">
        <p>{formatRequestBodyUnavailableReason(requestBody?.unavailableReason)}</p>
        {requestBody?.contentType ? <p>Content-Type: {requestBody.contentType}</p> : null}
        {requestBody ? <p>{requestBody.byteLength} bytes</p> : null}
      </div>
    );
  }

  const preview = createPayloadPreview(requestBody.content);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
        <span>{requestBody.kind.toUpperCase()}</span>
        <span>{requestBody.byteLength} bytes</span>
        {requestBody.contentType ? <span>{requestBody.contentType}</span> : null}
      </div>
      <PayloadBlock preview={preview} />
      {requestBody.redactedFieldPaths.length > 0 ? (
        <p className="break-all text-[11px] text-amber-300">
          伏字項目: {requestBody.redactedFieldPaths.join(', ')}
        </p>
      ) : null}
    </div>
  );
};

const ResponseBodyBlock = ({
  responseBody,
  fallbackBody
}: {
  responseBody?: SafeResponseBodyPreview;
  fallbackBody?: string;
}) => {
  if (!responseBody) {
    return <PayloadBlock preview={createPayloadPreview(fallbackBody)} />;
  }

  if (responseBody.kind === 'unavailable') {
    return (
      <div className="space-y-1 text-xs text-slate-500">
        <p>{formatResponseBodyUnavailableReason(responseBody.unavailableReason)}</p>
        {responseBody.contentType ? <p>Content-Type: {responseBody.contentType}</p> : null}
        <p>{responseBody.byteLength} bytes</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
        <span>JSON</span>
        <span>{responseBody.byteLength} bytes</span>
        {responseBody.contentType ? <span>{responseBody.contentType}</span> : null}
      </div>
      <PayloadBlock preview={createPayloadPreview(responseBody.content)} />
      {responseBody.redactedFieldPaths.length > 0 ? (
        <p className="break-all text-[11px] text-amber-300">
          マスキング項目: {responseBody.redactedFieldPaths.join(', ')}
        </p>
      ) : null}
    </div>
  );
};

const LogDetails = ({ log }: { log?: NetworkLog }) => {
  const requestHeaders = useMemo(() => toHeaderEntries(log?.requestHeaders ?? {}), [log?.requestHeaders]);
  const responseHeaders = useMemo(() => toHeaderEntries(log?.responseHeaders ?? {}), [log?.responseHeaders]);

  if (!log) {
    return (
      <div className="flex min-h-48 items-center justify-center px-4 py-8 text-center text-xs text-slate-500">
        一覧から通信を選択すると詳細を確認できます。
      </div>
    );
  }

  return (
    <div className="space-y-5 px-3 py-3">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-100">{formatMethodLabel(log.method)}</span>
          <span className={`text-xs font-medium ${getStatusTone(log.status)}`}>{log.status ?? '通信エラー'}</span>
          <span className="text-xs text-slate-400">{formatDurationLabel(log.durationMs)}</span>
          <span className="text-xs text-slate-500">{log.resourceType}</span>
        </div>
        <p className="break-all text-xs text-slate-200">{log.url}</p>
        <p className="text-[11px] text-slate-500">開始時刻: {formatStartedAtLabel(log.startedAt)}</p>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-300">Request headers</h3>
        <HeaderList entries={requestHeaders} emptyLabel="Request headersは取得されていません。" />
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-300">Request body preview</h3>
        <RequestBodyBlock requestBody={log.requestBody} />
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-300">Response headers</h3>
        <HeaderList entries={responseHeaders} emptyLabel="Response headersは取得されていません。" />
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-300">Response body preview</h3>
        <ResponseBodyBlock responseBody={log.responseBody} fallbackBody={log.responseBodySnippet} />
      </section>
    </div>
  );
};

export const ApiLogPanel = () => {
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const { filter, isLoading, errorMessage, logs, selectedLogId, pinnedLogIds } = useAppStore((state) => state.inspector);
  const setInspectorFilter = useAppStore((state) => state.setInspectorFilter);
  const setInspectorQuery = useAppStore((state) => state.setInspectorQuery);
  const setInspectorMethodFilter = useAppStore((state) => state.setInspectorMethodFilter);
  const setInspectorStatusFilter = useAppStore((state) => state.setInspectorStatusFilter);
  const toggleInspectorPinnedOnly = useAppStore((state) => state.toggleInspectorPinnedOnly);
  const resetInspectorFilters = useAppStore((state) => state.resetInspectorFilters);
  const toggleInspectorPin = useAppStore((state) => state.toggleInspectorPin);
  const selectInspectorLog = useAppStore((state) => state.selectInspectorLog);
  const filtered = useAppStore(selectFilteredLogs);
  const selectedLog = useAppStore(selectSelectedLog);
  const [previewingFormat, setPreviewingFormat] = useState<ApiLogExportFormat>();
  const [exportPreview, setExportPreview] = useState<ApiLogExportPreview>();
  const [savingPreview, setSavingPreview] = useState(false);
  const [refreshingPreview, setRefreshingPreview] = useState(false);
  const [maskingDraft, setMaskingDraft] = useState<ApiLogExportMaskingDraft>(createEmptyMaskingDraft);
  const [exportFeedback, setExportFeedback] = useState<ApiLogExportFeedback>();
  const [previewFeedback, setPreviewFeedback] = useState<ApiLogExportFeedback>();

  const pinnedIds = useMemo(() => new Set(pinnedLogIds), [pinnedLogIds]);
  const exportEligibleCount = useMemo(
    () => logs.filter((log) => filter.kind === 'all' || log.resourceType === filter.kind).length,
    [filter.kind, logs]
  );

  const emptyLabel = useMemo(() => {
    if (!activeWorkspaceId) return 'ワークスペースを選択してください';
    if (isLoading) return 'APIログを読み込み中です';
    if (logs.length === 0) return 'ログ未取得: XHR / fetch 通信を待っています';
    if (filter.pinnedOnly && pinnedLogIds.length === 0) return 'ピン留めされた通信はありません。';
    if (filtered.length === 0) return '検索・絞り込み条件に一致する通信はありません。';
    return undefined;
  }, [activeWorkspaceId, filter.pinnedOnly, filtered.length, isLoading, logs.length, pinnedLogIds.length]);

  const parsedMaskingRules = useMemo(
    () => parseApiLogExportCustomMaskingRuleText(maskingDraft),
    [maskingDraft]
  );
  const hasUnappliedRuleChanges = useMemo(() => {
    if (!exportPreview) return false;
    if (parsedMaskingRules.status === 'invalid') return true;
    return !areMaskingRulesEqual(parsedMaskingRules.rules, exportPreview.customMaskingRules);
  }, [exportPreview, parsedMaskingRules]);
  const isPreviewBusy = savingPreview || refreshingPreview;

  useEffect(() => {
    setExportPreview((current) => {
      if (current) {
        void window.stackpilot.apiLog.discardExportPreview({ previewId: current.previewId });
      }
      return undefined;
    });
    setMaskingDraft(createEmptyMaskingDraft());
    setPreviewFeedback(undefined);
  }, [activeWorkspaceId, filter.kind]);

  useEffect(() => {
    if (!exportPreview || isPreviewBusy) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const previewId = exportPreview.previewId;
      setExportPreview(undefined);
      setMaskingDraft(createEmptyMaskingDraft());
      setPreviewFeedback(undefined);
      void window.stackpilot.apiLog.discardExportPreview({ previewId });
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [exportPreview, isPreviewBusy]);

  const generateExportPreview = async (
    format: ApiLogExportFormat,
    customMaskingRules: ApiLogExportCustomMaskingRules,
    mode: 'open' | 'refresh'
  ): Promise<void> => {
    if (!activeWorkspaceId || previewingFormat || isPreviewBusy) return;

    if (mode === 'open') setPreviewingFormat(format);
    else setRefreshingPreview(true);
    setExportFeedback(undefined);
    setPreviewFeedback(undefined);

    try {
      const result = await window.stackpilot.apiLog.previewExport({
        workspaceId: activeWorkspaceId,
        format,
        filterKind: filter.kind,
        customMaskingRules
      });
      if (result.status === 'failed') {
        const feedback = { kind: 'error' as const, message: result.errorMessage };
        if (mode === 'open') setExportFeedback(feedback);
        else setPreviewFeedback(feedback);
        return;
      }

      setExportPreview(result.preview);
      setMaskingDraft(toMaskingDraft(result.preview.customMaskingRules));
      if (mode === 'refresh') {
        const appliedCount = countMaskingRules(result.preview.customMaskingRules);
        setPreviewFeedback({
          kind: 'success',
          message: appliedCount > 0
            ? `追加マスキングルール${appliedCount}件を反映し、新しい成果物を生成しました。`
            : '追加マスキングルールを解除し、新しい成果物を生成しました。'
        });
      }
    } catch {
      const feedback = {
        kind: 'error' as const,
        message: mode === 'open'
          ? '安全化済みプレビューを生成できませんでした。'
          : '追加ルールを適用した再プレビューを生成できませんでした。'
      };
      if (mode === 'open') setExportFeedback(feedback);
      else setPreviewFeedback(feedback);
    } finally {
      if (mode === 'open') setPreviewingFormat(undefined);
      else setRefreshingPreview(false);
    }
  };

  const openExportPreview = async (format: ApiLogExportFormat): Promise<void> => {
    const rules = emptyApiLogExportCustomMaskingRules();
    setMaskingDraft(toMaskingDraft(rules));
    await generateExportPreview(format, rules, 'open');
  };

  const applyCustomMaskingRules = async (): Promise<void> => {
    if (!exportPreview || isPreviewBusy) return;
    if (parsedMaskingRules.status === 'invalid') {
      setPreviewFeedback({ kind: 'error', message: parsedMaskingRules.errorMessage });
      return;
    }
    await generateExportPreview(exportPreview.format, parsedMaskingRules.rules, 'refresh');
  };

  const clearCustomMaskingRules = async (): Promise<void> => {
    if (!exportPreview || isPreviewBusy) return;
    const rules = emptyApiLogExportCustomMaskingRules();
    setMaskingDraft(toMaskingDraft(rules));
    await generateExportPreview(exportPreview.format, rules, 'refresh');
  };

  const togglePathSegment = (value: string): void => {
    if (isPreviewBusy) return;
    setMaskingDraft((current) => {
      const currentValues = splitDraftValues(current.pathSegmentValuesText);
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((item) => item !== value)
        : [...currentValues, value];
      return { ...current, pathSegmentValuesText: nextValues.join('\n') };
    });
    setPreviewFeedback(undefined);
  };

  const closeExportPreview = (): void => {
    if (!exportPreview || isPreviewBusy) return;
    const previewId = exportPreview.previewId;
    setExportPreview(undefined);
    setMaskingDraft(createEmptyMaskingDraft());
    setPreviewFeedback(undefined);
    void window.stackpilot.apiLog.discardExportPreview({ previewId });
  };

  const saveExportPreview = async (): Promise<void> => {
    if (!exportPreview || isPreviewBusy || hasUnappliedRuleChanges) return;

    const currentPreview = exportPreview;
    setSavingPreview(true);
    setPreviewFeedback(undefined);
    try {
      const result = await window.stackpilot.apiLog.saveExport({ previewId: currentPreview.previewId });
      if (result.status === 'cancelled') {
        setPreviewFeedback({ kind: 'info', message: '保存をキャンセルしました。同じ内容で再試行できます。' });
        return;
      }
      if (result.status === 'failed') {
        if (result.errorCode === 'preview-expired' || result.errorCode === 'preview-not-found') {
          setExportPreview(undefined);
          setMaskingDraft(createEmptyMaskingDraft());
          setExportFeedback({ kind: 'error', message: result.errorMessage });
          return;
        }
        setPreviewFeedback({ kind: 'error', message: result.errorMessage });
        return;
      }

      const hashMatches = result.artifactSha256 === currentPreview.artifactSha256;
      const omittedLabel = result.omittedCount > 0 ? ` ${result.omittedCount}件は上限により省略しました。` : '';
      const customRuleLabel = countMaskingRules(currentPreview.customMaskingRules) > 0
        ? ` 追加マスキングルール${countMaskingRules(currentPreview.customMaskingRules)}件を適用済みです。`
        : '';
      setExportPreview(undefined);
      setMaskingDraft(createEmptyMaskingDraft());
      setExportFeedback({
        kind: hashMatches ? 'success' : 'error',
        message: hashMatches
          ? `${result.exportedCount}件を確認済みの内容で保存しました。${omittedLabel}${customRuleLabel} 保存先: ${result.filePath}`
          : '保存後の整合性確認に失敗しました。成果物を外部共有せず、再度保存してください。'
      });
    } catch {
      setPreviewFeedback({ kind: 'error', message: 'APIログの保存処理を開始できませんでした。' });
    } finally {
      setSavingPreview(false);
    }
  };

  const exportDisabled =
    !activeWorkspaceId ||
    exportEligibleCount === 0 ||
    Boolean(previewingFormat) ||
    isPreviewBusy;

  return (
    <>
      <aside className="flex h-full w-[420px] min-w-[340px] max-w-[42vw] flex-col border-l border-slate-800 bg-slate-950/80">
        <div className="border-b border-slate-800 px-3 py-2">
          <h2 className="text-sm font-semibold text-slate-100">API Inspector</h2>
          <p className="text-xs text-slate-400">通信を検索・ピン留めして安全化済みの詳細を確認</p>
        </div>

        <div className="space-y-3 border-b border-slate-800 px-3 py-2.5">
          <ApiLogFilterToolbar
            filter={filter}
            totalCount={logs.length}
            visibleCount={filtered.length}
            pinnedCount={pinnedLogIds.length}
            disabled={isLoading}
            onResourceKindChange={setInspectorFilter}
            onQueryChange={setInspectorQuery}
            onMethodChange={setInspectorMethodFilter}
            onStatusChange={setInspectorStatusFilter}
            onTogglePinnedOnly={toggleInspectorPinnedOnly}
            onReset={resetInspectorFilters}
          />

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-2">
            <p className="max-w-[230px] text-[10px] leading-4 text-slate-500">
              JSON/HAR保存は検索・method・status・ピンを含めず、{filter.kind}ログ最大500件が対象です。
            </p>
            <div className="flex items-center gap-2">
              {(['json', 'har'] as const).map((format) => (
                <button
                  key={format}
                  type="button"
                  disabled={exportDisabled}
                  aria-busy={previewingFormat === format}
                  className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-medium uppercase text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => void openExportPreview(format)}
                >
                  {previewingFormat === format ? '確認中…' : `${format}確認`}
                </button>
              ))}
            </div>
          </div>

          {exportFeedback ? (
            <p
              role="status"
              className={`break-all text-[10px] leading-4 ${
                exportFeedback.kind === 'success'
                  ? 'text-emerald-300'
                  : exportFeedback.kind === 'error'
                    ? 'text-rose-300'
                    : 'text-slate-400'
              }`}
            >
              {exportFeedback.message}
            </p>
          ) : null}
        </div>

        {errorMessage ? (
          <div className="m-3 rounded border border-rose-800/60 bg-rose-950/50 px-3 py-2 text-xs text-rose-200">
            エラー: {errorMessage}
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col">
          <section className="min-h-0 flex-1 overflow-auto border-b border-slate-800 px-2 py-2" aria-label="API通信一覧">
            {emptyLabel ? (
              <div className="px-1 py-6 text-xs text-slate-400">{emptyLabel}</div>
            ) : (
              <div className="space-y-1">
                {filtered.map((log) => {
                  const isSelected = selectedLogId === log.id;
                  const isPinned = pinnedIds.has(log.id);
                  return (
                    <div
                      key={log.id}
                      className={`grid grid-cols-[30px_minmax(0,1fr)] items-stretch rounded-lg transition-colors ${
                        isSelected
                          ? 'bg-indigo-500/20 ring-1 ring-indigo-400/40'
                          : isPinned
                            ? 'bg-amber-500/[0.07] ring-1 ring-amber-400/10'
                            : 'hover:bg-slate-900'
                      }`}
                    >
                      <button
                        type="button"
                        aria-label={isPinned ? '通信のピン留めを解除' : '通信をピン留め'}
                        aria-pressed={isPinned}
                        title={isPinned ? 'ピン留めを解除' : '一覧上部へピン留め'}
                        className={`flex items-center justify-center rounded-l-lg transition-colors ${
                          isPinned ? 'text-amber-300' : 'text-slate-600 hover:text-slate-300'
                        }`}
                        onClick={() => toggleInspectorPin(log.id)}
                      >
                        <PinIcon className="h-3.5 w-3.5" filled={isPinned} />
                      </button>
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        className="grid w-full grid-cols-[52px_42px_58px_minmax(0,1fr)] gap-2 rounded-r-lg px-1.5 py-2 text-left text-xs"
                        onClick={() => selectInspectorLog(log.id)}
                      >
                        <span className="font-medium text-slate-200">{formatMethodLabel(log.method)}</span>
                        <span className={getStatusTone(log.status)}>{log.status ?? 'ERR'}</span>
                        <span className="text-slate-400">{formatDurationLabel(log.durationMs)}</span>
                        <span className="truncate text-slate-300" title={log.url}>
                          {toPathLabel(log.url)}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="max-h-[52%] min-h-48 overflow-auto" aria-label="選択中のAPI通信詳細">
            <LogDetails log={selectedLog} />
          </section>
        </div>
      </aside>

      {exportPreview ? (
        <ApiLogExportPreviewDialog
          preview={exportPreview}
          maskingDraft={maskingDraft}
          isSaving={savingPreview}
          isRefreshing={refreshingPreview}
          hasUnappliedRuleChanges={hasUnappliedRuleChanges}
          feedback={previewFeedback}
          onMaskingDraftChange={setMaskingDraft}
          onTogglePathSegment={togglePathSegment}
          onApplyRules={() => void applyCustomMaskingRules()}
          onClearRules={() => void clearCustomMaskingRules()}
          onClose={closeExportPreview}
          onSave={() => void saveExportPreview()}
        />
      ) : null}
    </>
  );
};

const createEmptyMaskingDraft = (): ApiLogExportMaskingDraft => ({
  pathSegmentValuesText: '',
  queryNamesText: '',
  headerNamesText: '',
  bodyFieldNamesText: ''
});

const toMaskingDraft = (rules: ApiLogExportCustomMaskingRules): ApiLogExportMaskingDraft => ({
  pathSegmentValuesText: rules.pathSegmentValues.join('\n'),
  queryNamesText: rules.queryNames.join('\n'),
  headerNamesText: rules.headerNames.join('\n'),
  bodyFieldNamesText: rules.bodyFieldNames.join('\n')
});

const areMaskingRulesEqual = (
  left: ApiLogExportCustomMaskingRules,
  right: ApiLogExportCustomMaskingRules
): boolean =>
  areRuleListsEqual(left.pathSegmentValues, right.pathSegmentValues) &&
  areRuleListsEqual(left.queryNames, right.queryNames) &&
  areRuleListsEqual(left.headerNames, right.headerNames) &&
  areRuleListsEqual(left.bodyFieldNames, right.bodyFieldNames);

const areRuleListsEqual = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const countMaskingRules = (rules: ApiLogExportCustomMaskingRules): number =>
  rules.pathSegmentValues.length + rules.queryNames.length + rules.headerNames.length + rules.bodyFieldNames.length;

const splitDraftValues = (value: string): string[] =>
  value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
