import { useEffect, useMemo, useState } from 'react';
import type { ApiLogExportFormat } from '../../shared/domain/apiLogExport';
import type {
  ApiLogExportMaskingReport,
  ApiLogExportPreview,
  ApiLogExportPreviewEntry
} from '../../shared/domain/apiLogExportPreview';
import {
  createPayloadPreview,
  formatDurationLabel,
  formatMethodLabel,
  formatStartedAtLabel,
  getStatusTone,
  toHeaderEntries,
  toPathLabel,
  type HeaderEntry,
  type InspectorFilter,
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
import { selectFilteredLogs, selectSelectedLog, useAppStore } from '../store/appStore';

const filterButtons: InspectorFilter['kind'][] = ['all', 'xhr', 'fetch'];

const bodyStateLabels = {
  included: '含む',
  unavailable: '取得不可',
  'not-captured': '未取得'
} as const;

type ExportFeedback = {
  kind: 'success' | 'info' | 'error';
  message: string;
};

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

const MaskingReport = ({ report }: { report: ApiLogExportMaskingReport }) => {
  const groups = [
    {
      title: 'URL',
      items: [
        ['認証情報を除去', report.urlUserInfoRemoved],
        ['不正URLを非公開化', report.invalidUrlsRedacted],
        ['fragmentを伏字化', report.urlFragmentsRedacted],
        ['機密クエリを伏字化', report.sensitiveQueryValuesRedacted]
      ]
    },
    {
      title: 'Headers',
      items: [
        ['Request値を伏字化', report.requestHeaderValuesRedacted],
        ['Response値を伏字化', report.responseHeaderValuesRedacted],
        ['Request URL値を再安全化', report.requestUrlHeaderValuesSanitized],
        ['Response URL値を再安全化', report.responseUrlHeaderValuesSanitized]
      ]
    },
    {
      title: 'Bodies / Errors',
      items: [
        ['Requestフィールドを伏字化', report.requestBodyFieldsRedacted],
        ['Responseフィールドを伏字化', report.responseBodyFieldsRedacted],
        ['Request body取得不可', report.requestBodiesUnavailable],
        ['Response body取得不可', report.responseBodiesUnavailable],
        ['通信エラー文字列を除外', report.networkErrorStringsExcluded]
      ]
    }
  ] as const;

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {groups.map((group) => (
        <section key={group.title} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <h3 className="mb-2 text-xs font-semibold text-slate-200">{group.title}</h3>
          <dl className="space-y-1.5">
            {group.items.map(([label, count]) => (
              <div key={label} className="flex items-center justify-between gap-3 text-[11px]">
                <dt className="text-slate-400">{label}</dt>
                <dd className={count > 0 ? 'font-semibold text-amber-300' : 'text-slate-500'}>{count}件</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
};

const PreviewEntryList = ({ entries }: { entries: ApiLogExportPreviewEntry[] }) => {
  if (entries.length === 0) {
    return <p className="text-xs text-slate-500">出力対象の通信はありません。</p>;
  }

  return (
    <div className="space-y-1">
      {entries.map((entry) => (
        <div key={entry.id} className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
          <div className="grid grid-cols-[48px_42px_minmax(0,1fr)] items-center gap-2 text-xs">
            <span className="font-semibold text-slate-200">{entry.method}</span>
            <span className={getStatusTone(entry.status)}>{entry.status ?? 'ERR'}</span>
            <span className="truncate text-slate-300" title={entry.url}>{entry.url}</span>
          </div>
          <p className="mt-1 text-[10px] leading-4 text-slate-500">
            Request body: {bodyStateLabels[entry.requestBodyState]} / Response body: {bodyStateLabels[entry.responseBodyState]}
            {' · '}headers伏字 {entry.requestHeaderValuesRedacted + entry.responseHeaderValuesRedacted}件
            {' · '}body伏字 {entry.requestBodyFieldsRedacted + entry.responseBodyFieldsRedacted}件
          </p>
        </div>
      ))}
    </div>
  );
};

const ExportPreviewDialog = ({
  preview,
  isSaving,
  feedback,
  onClose,
  onSave
}: {
  preview: ApiLogExportPreview;
  isSaving: boolean;
  feedback?: ExportFeedback;
  onClose: () => void;
  onSave: () => void;
}) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
    onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isSaving) onClose();
    }}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="api-log-export-preview-title"
      className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
    >
      <header className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="api-log-export-preview-title" className="text-base font-semibold text-slate-100">保存前プレビュー</h2>
            <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-xs font-semibold uppercase text-indigo-200">
              {preview.format}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            {preview.workspace.name} · {preview.filterKind} · {preview.exportedCount}件
            {preview.omittedCount > 0 ? `（${preview.omittedCount}件省略）` : ''}
          </p>
        </div>
        <button
          type="button"
          disabled={isSaving}
          aria-label="エクスポートプレビューを閉じる"
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          onClick={onClose}
        >
          閉じる
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-auto px-5 py-4">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <PreviewMetric label="成果物サイズ" value={formatFileSize(preview.contentByteLength)} />
          <PreviewMetric label="生成時刻" value={formatTimestamp(preview.exportedAt)} />
          <PreviewMetric label="有効期限" value={formatTimestamp(preview.expiresAt)} />
          <PreviewMetric label="サンプル表示" value={`${preview.sampleEntries.length} / ${preview.exportedCount}件`} />
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-200">マスキングレポート</h3>
          <MaskingReport report={preview.maskingReport} />
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-200">安全化済み通信サンプル</h3>
          <PreviewEntryList entries={preview.sampleEntries} />
        </section>

        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-200">ファイル内容プレビュー</h3>
            {preview.isContentPreviewTruncated ? (
              <span className="text-[11px] text-amber-300">先頭12,000文字のみ表示</span>
            ) : null}
          </div>
          <pre className="max-h-80 overflow-auto whitespace-pre rounded-lg border border-slate-800 bg-slate-950 p-3 text-[11px] leading-5 text-slate-200">
            {preview.contentPreview}
          </pre>
        </section>

        <section className="space-y-2 rounded-lg border border-amber-800/60 bg-amber-950/25 p-3 text-[11px] leading-5 text-amber-100">
          <p className="font-semibold">保存前の確認事項</p>
          <ul className="list-disc space-y-1 pl-5 text-amber-200/90">
            <li>URL pathへ直接埋め込まれたtokenやIDは完全には自動判定できません。</li>
            <li>通常名のクエリ値やbody項目に含まれる個人情報は、自動的に伏字化されない場合があります。</li>
            <li>このプレビューは2分で失効します。保存時は確認したものと同じ成果物を使用します。</li>
          </ul>
        </section>

        <section className="space-y-1 text-[10px] leading-4 text-slate-500">
          <p>SHA-256</p>
          <p className="break-all font-mono text-slate-400">{preview.artifactSha256}</p>
        </section>

        {feedback ? (
          <p
            role="status"
            className={`rounded-lg border px-3 py-2 text-xs ${
              feedback.kind === 'error'
                ? 'border-rose-800/60 bg-rose-950/40 text-rose-200'
                : 'border-slate-700 bg-slate-950/70 text-slate-300'
            }`}
          >
            {feedback.message}
          </p>
        ) : null}
      </div>

      <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-800 px-5 py-4">
        <button
          type="button"
          disabled={isSaving}
          className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          onClick={onClose}
        >
          キャンセル
        </button>
        <button
          type="button"
          disabled={isSaving}
          aria-busy={isSaving}
          className="rounded-lg bg-indigo-500 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onSave}
        >
          {isSaving ? '保存中…' : 'この内容を保存'}
        </button>
      </footer>
    </div>
  </div>
);

const PreviewMetric = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
    <p className="text-[10px] text-slate-500">{label}</p>
    <p className="mt-1 break-all text-xs font-medium text-slate-200">{value}</p>
  </div>
);

export const ApiLogPanel = () => {
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const { filter, isLoading, errorMessage, logs, selectedLogId } = useAppStore((state) => state.inspector);
  const setInspectorFilter = useAppStore((state) => state.setInspectorFilter);
  const selectInspectorLog = useAppStore((state) => state.selectInspectorLog);
  const filtered = useAppStore(selectFilteredLogs);
  const selectedLog = useAppStore(selectSelectedLog);
  const [previewingFormat, setPreviewingFormat] = useState<ApiLogExportFormat>();
  const [exportPreview, setExportPreview] = useState<ApiLogExportPreview>();
  const [savingPreview, setSavingPreview] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<ExportFeedback>();
  const [previewFeedback, setPreviewFeedback] = useState<ExportFeedback>();

  const emptyLabel = useMemo(() => {
    if (!activeWorkspaceId) return 'ワークスペースを選択してください';
    if (isLoading) return 'APIログを読み込み中です';
    if (logs.length === 0) return 'ログ未取得: XHR / fetch 通信を待っています';
    if (filtered.length === 0) return `通信なし: ${filter.kind} に一致するログはありません`;
    return undefined;
  }, [activeWorkspaceId, filter.kind, filtered.length, isLoading, logs.length]);

  useEffect(() => {
    setExportPreview((current) => {
      if (current) {
        void window.stackpilot.apiLog.discardExportPreview({ previewId: current.previewId });
      }
      return undefined;
    });
    setPreviewFeedback(undefined);
  }, [activeWorkspaceId, filter.kind]);

  useEffect(() => {
    if (!exportPreview || savingPreview) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const previewId = exportPreview.previewId;
      setExportPreview(undefined);
      setPreviewFeedback(undefined);
      void window.stackpilot.apiLog.discardExportPreview({ previewId });
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [exportPreview, savingPreview]);

  const openExportPreview = async (format: ApiLogExportFormat): Promise<void> => {
    if (!activeWorkspaceId || previewingFormat || savingPreview) return;

    setPreviewingFormat(format);
    setExportFeedback(undefined);
    setPreviewFeedback(undefined);
    try {
      const result = await window.stackpilot.apiLog.previewExport({
        workspaceId: activeWorkspaceId,
        format,
        filterKind: filter.kind
      });
      if (result.status === 'failed') {
        setExportFeedback({ kind: 'error', message: result.errorMessage });
        return;
      }
      setExportPreview(result.preview);
    } catch {
      setExportFeedback({ kind: 'error', message: '安全化済みプレビューを生成できませんでした。' });
    } finally {
      setPreviewingFormat(undefined);
    }
  };

  const closeExportPreview = (): void => {
    if (!exportPreview || savingPreview) return;
    const previewId = exportPreview.previewId;
    setExportPreview(undefined);
    setPreviewFeedback(undefined);
    void window.stackpilot.apiLog.discardExportPreview({ previewId });
  };

  const saveExportPreview = async (): Promise<void> => {
    if (!exportPreview || savingPreview) return;

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
          setExportFeedback({ kind: 'error', message: result.errorMessage });
          return;
        }
        setPreviewFeedback({ kind: 'error', message: result.errorMessage });
        return;
      }

      const hashMatches = result.artifactSha256 === currentPreview.artifactSha256;
      const omittedLabel = result.omittedCount > 0 ? ` ${result.omittedCount}件は上限により省略しました。` : '';
      setExportPreview(undefined);
      setExportFeedback({
        kind: hashMatches ? 'success' : 'error',
        message: hashMatches
          ? `${result.exportedCount}件を確認済みの内容で保存しました。${omittedLabel} 保存先: ${result.filePath}`
          : '保存後の整合性確認に失敗しました。成果物を外部共有せず、再度保存してください。'
      });
    } catch {
      setPreviewFeedback({ kind: 'error', message: 'APIログの保存処理を開始できませんでした。' });
    } finally {
      setSavingPreview(false);
    }
  };

  const exportDisabled = !activeWorkspaceId || filtered.length === 0 || Boolean(previewingFormat) || savingPreview;

  return (
    <>
      <aside className="flex h-full w-[420px] min-w-[340px] max-w-[42vw] flex-col border-l border-slate-800 bg-slate-950/80">
        <div className="border-b border-slate-800 px-3 py-2">
          <h2 className="text-sm font-semibold text-slate-100">API Inspector</h2>
          <p className="text-xs text-slate-400">通信を選択してヘッダーと安全化済み本文を確認</p>
        </div>

        <div className="space-y-2 border-b border-slate-800 px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {filterButtons.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className={`rounded px-2 py-1 text-xs ${
                    filter.kind === kind ? 'bg-indigo-500/30 text-indigo-200' : 'bg-slate-800 text-slate-300'
                  }`}
                  onClick={() => setInspectorFilter(kind)}
                >
                  {kind}
                </button>
              ))}
            </div>

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
          <p className="text-[10px] leading-4 text-slate-500">
            現在の{filter.kind}ログを最大500件安全化し、内容とマスキング結果を確認してから保存します。
          </p>
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
          <div className="m-3 rounded border border-rose-800/60 bg-rose-950/50 px-3 py-2 text-xs text-rose-200">エラー: {errorMessage}</div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col">
          <section className="min-h-0 flex-1 overflow-auto border-b border-slate-800 px-2 py-2" aria-label="API通信一覧">
            {emptyLabel ? (
              <div className="px-1 py-6 text-xs text-slate-400">{emptyLabel}</div>
            ) : (
              <div className="space-y-1">
                {filtered.map((log) => {
                  const isSelected = selectedLogId === log.id;
                  return (
                    <button
                      key={log.id}
                      type="button"
                      aria-pressed={isSelected}
                      className={`grid w-full grid-cols-[52px_42px_58px_minmax(0,1fr)] gap-2 rounded-lg px-2 py-2 text-left text-xs transition-colors ${
                        isSelected ? 'bg-indigo-500/20 ring-1 ring-indigo-400/40' : 'hover:bg-slate-900'
                      }`}
                      onClick={() => selectInspectorLog(log.id)}
                    >
                      <span className="font-medium text-slate-200">{formatMethodLabel(log.method)}</span>
                      <span className={getStatusTone(log.status)}>{log.status ?? '-'}</span>
                      <span className="text-slate-400">{formatDurationLabel(log.durationMs)}</span>
                      <span className="truncate text-slate-300" title={log.url}>
                        {toPathLabel(log.url)}
                      </span>
                    </button>
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
        <ExportPreviewDialog
          preview={exportPreview}
          isSaving={savingPreview}
          feedback={previewFeedback}
          onClose={closeExportPreview}
          onSave={() => void saveExportPreview()}
        />
      ) : null}
    </>
  );
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
};

const formatTimestamp = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString('ja-JP', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
