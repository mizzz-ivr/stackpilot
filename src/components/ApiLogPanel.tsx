import { useMemo } from 'react';
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
  const { filter, isLoading, errorMessage, logs, selectedLogId } = useAppStore((state) => state.inspector);
  const setInspectorFilter = useAppStore((state) => state.setInspectorFilter);
  const selectInspectorLog = useAppStore((state) => state.selectInspectorLog);
  const filtered = useAppStore(selectFilteredLogs);
  const selectedLog = useAppStore(selectSelectedLog);

  const emptyLabel = useMemo(() => {
    if (!activeWorkspaceId) return 'ワークスペースを選択してください';
    if (isLoading) return 'APIログを読み込み中です';
    if (logs.length === 0) return 'ログ未取得: XHR / fetch 通信を待っています';
    if (filtered.length === 0) return `通信なし: ${filter.kind} に一致するログはありません`;
    return undefined;
  }, [activeWorkspaceId, filter.kind, filtered.length, isLoading, logs.length]);

  return (
    <aside className="flex h-full w-[420px] min-w-[340px] max-w-[42vw] flex-col border-l border-slate-800 bg-slate-950/80">
      <div className="border-b border-slate-800 px-3 py-2">
        <h2 className="text-sm font-semibold text-slate-100">API Inspector</h2>
        <p className="text-xs text-slate-400">通信を選択してヘッダーと安全化済み本文を確認</p>
      </div>

      <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2">
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
  );
};
