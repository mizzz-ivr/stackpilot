import { useEffect, useMemo, useRef } from 'react';
import {
  compareNetworkLogs,
  createApiLogComparisonSummary,
  createApiLogComparisonView,
  type ApiLogComparisonSummary,
  type ApiLogComparisonVerdict,
  type BodyComparison,
  type ComparableBody,
  type ComparisonDifferenceKind,
  type HeaderComparisonRow
} from '../../shared/domain/apiLogComparison';
import { toPathLabel, type NetworkLog } from '../../shared/domain/inspector';
import { formatRequestBodyUnavailableReason } from '../../shared/domain/requestBody';
import { formatResponseBodyUnavailableReason } from '../../shared/domain/responseBody';

export interface ApiLogComparisonSaveFeedback {
  kind: 'success' | 'error' | 'info';
  message: string;
}

interface ApiLogComparisonDialogProps {
  left: NetworkLog;
  right: NetworkLog;
  differencesOnly: boolean;
  isSaving: boolean;
  saveFeedback?: ApiLogComparisonSaveFeedback;
  onDifferencesOnlyChange: (value: boolean) => void;
  onSave: () => void;
  onRemove: (logId: string) => void;
  onClear: () => void;
  onClose: () => void;
}

export const CompareIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
    <path d="M8 7h11m0 0-3-3m3 3-3 3M16 17H5m0 0 3 3m-3-3 3-3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ApiLogComparisonDialog = ({
  left,
  right,
  differencesOnly,
  isSaving,
  saveFeedback,
  onDifferencesOnlyChange,
  onSave,
  onRemove,
  onClear,
  onClose
}: ApiLogComparisonDialogProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const comparison = useMemo(() => compareNetworkLogs(left, right), [left, right]);
  const summary = useMemo(
    () => createApiLogComparisonSummary(left, right, comparison),
    [left, right, comparison]
  );
  const view = useMemo(
    () => createApiLogComparisonView(comparison, differencesOnly),
    [comparison, differencesOnly]
  );

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving) {
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
  }, [isSaving]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-log-comparison-title"
        className="flex max-h-[92vh] w-full max-w-[1200px] flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl"
      >
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="api-log-comparison-title" className="text-base font-semibold text-slate-100">API通信比較</h2>
              <DifferenceBadge difference={view.hasDifferences ? 'different' : 'same'} />
              <span aria-live="polite" className="text-[11px] text-slate-400">
                表示 {view.counts.visible} / 全{view.counts.total}項目・差分{view.counts.different}件
              </span>
            </div>
            <p className="text-xs text-slate-400">画面は安全化済みログを比較し、保存時はmain processでURLとheaderを再サニタイズします。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200">
              <input
                type="checkbox"
                checked={differencesOnly}
                disabled={isSaving}
                aria-label="差分のある項目だけを表示"
                onChange={(event) => onDifferencesOnlyChange(event.target.checked)}
              />
              差分のみ
            </label>
            <button
              type="button"
              disabled={isSaving}
              aria-busy={isSaving}
              aria-label="安全化済みAPI通信比較JSONを保存"
              className="rounded-lg bg-cyan-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onSave}
            >
              {isSaving ? '保存中…' : 'JSON保存'}
            </button>
            <button
              type="button"
              autoFocus
              disabled={isSaving}
              aria-label="API通信比較を閉じる"
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              onClick={onClose}
            >
              閉じる
            </button>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-px border-b border-slate-800 bg-slate-800">
          <ComparisonTargetHeader label="比較A" log={left} disabled={isSaving} onRemove={() => onRemove(left.id)} />
          <ComparisonTargetHeader label="比較B" log={right} disabled={isSaving} onRemove={() => onRemove(right.id)} />
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-auto px-5 py-5">
          <ComparisonInsightSummary summary={summary} />

          {differencesOnly && view.counts.different === 0 ? (
            <div role="status" className="rounded-lg border border-emerald-800/60 bg-emerald-950/30 px-4 py-5 text-sm text-emerald-200">
              比較対象に差分はありません。
            </div>
          ) : null}

          {view.summary.length > 0 ? (
            <SummarySection rows={view.summary} />
          ) : null}
          <HeaderComparisonSection title="Request headers" rows={view.requestHeaders} hiddenByFilter={differencesOnly && comparison.requestHeaders.length > 0} />
          {view.requestBody ? <BodyComparisonSection title="Request body" comparison={view.requestBody} kind="request" /> : null}
          <HeaderComparisonSection title="Response headers" rows={view.responseHeaders} hiddenByFilter={differencesOnly && comparison.responseHeaders.length > 0} />
          {view.responseBody ? <BodyComparisonSection title="Response body" comparison={view.responseBody} kind="response" /> : null}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 px-5 py-3">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-[11px] text-slate-500">保存成果物にraw body・通信エラー詳細・認証情報は含めません。</p>
            {saveFeedback ? (
              <p
                role="status"
                className={`break-all text-[11px] ${
                  saveFeedback.kind === 'success'
                    ? 'text-emerald-300'
                    : saveFeedback.kind === 'error'
                      ? 'text-rose-300'
                      : 'text-slate-400'
                }`}
              >
                {saveFeedback.message}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            disabled={isSaving}
            className="rounded-lg border border-rose-800/70 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-950/40 disabled:opacity-50"
            onClick={onClear}
          >
            比較対象をすべて解除
          </button>
        </footer>
      </div>
    </div>
  );
};

const ComparisonInsightSummary = ({ summary }: { summary: ApiLogComparisonSummary }) => (
  <section
    aria-label="主要差分サマリー"
    data-verdict={summary.verdict}
    className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4"
  >
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-100">主要差分サマリー</h3>
        <p className="mt-1 text-[11px] text-slate-500">比較Bが比較Aからどう変わったかを要約します。品質の良否は自動判定しません。</p>
      </div>
      <ComparisonVerdictBadge verdict={summary.verdict} />
    </div>

    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <InsightCard
        label="Status"
        value={`${summary.status.left} → ${summary.status.right}`}
        detail={summary.status.label}
        attention={summary.status.kind === 'success-to-non-success'}
      />
      <InsightCard label="Duration差" value={summary.duration.label} detail="比較B - 比較A" />
      <InsightCard label="Query差分" value={summary.query.label} detail={summary.query.comparable ? '同名queryは出現順で比較' : 'URLを解釈できないためquery集計なし'} />
      <InsightCard
        label="Request headers"
        value={`${summary.requestHeaders.different} / ${summary.requestHeaders.total}件`}
        detail="差分 / 全header"
      />
      <InsightCard
        label="Response headers"
        value={`${summary.responseHeaders.different} / ${summary.responseHeaders.total}件`}
        detail="差分 / 全header"
      />
      <InsightCard
        label="Body"
        value={`Request ${summary.requestBodyChanged ? '差分あり' : '同一'} / Response ${summary.responseBodyChanged ? '差分あり' : '同一'}`}
        detail="安全化済みpreviewを比較"
      />
    </div>
  </section>
);

const InsightCard = ({ label, value, detail, attention = false }: { label: string; value: string; detail: string; attention?: boolean }) => (
  <div className={`min-w-0 rounded-lg border px-3 py-3 ${attention ? 'border-rose-800/70 bg-rose-950/25' : 'border-slate-800 bg-slate-950/70'}`}>
    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
    <p className={`mt-1 break-words text-xs font-semibold ${attention ? 'text-rose-200' : 'text-slate-200'}`}>{value}</p>
    <p className="mt-1 text-[10px] text-slate-500">{detail}</p>
  </div>
);

const ComparisonVerdictBadge = ({ verdict }: { verdict: ApiLogComparisonVerdict }) => {
  const tone = verdict === 'same'
    ? 'border-emerald-800/60 bg-emerald-950/40 text-emerald-300'
    : verdict === 'attention'
      ? 'border-rose-800/70 bg-rose-950/40 text-rose-200'
      : 'border-amber-700/70 bg-amber-950/50 text-amber-200';
  const label = verdict === 'same' ? '差分なし' : verdict === 'attention' ? '要確認' : '差分あり';
  return <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${tone}`}>{label}</span>;
};

const SummarySection = ({ rows }: { rows: ReturnType<typeof compareNetworkLogs>['summary'] }) => (
  <section className="space-y-2" aria-labelledby="comparison-summary-title">
    <SectionTitle id="comparison-summary-title" title="概要" difference={rows.some((row) => row.difference !== 'same')} />
    <div role="table" aria-label="通信概要の比較" className="overflow-hidden rounded-lg border border-slate-800">
      <div role="row" className="grid grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)] bg-slate-900 text-[11px] font-medium text-slate-400">
        <div role="columnheader" className="px-3 py-2">項目</div>
        <div role="columnheader" className="border-l border-slate-800 px-3 py-2">比較A</div>
        <div role="columnheader" className="border-l border-slate-800 px-3 py-2">比較B</div>
      </div>
      {rows.map((row) => (
        <div key={row.key} role="row" data-difference={row.difference} className={`grid grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)] border-t border-slate-800 text-xs ${differenceBackground(row.difference)}`}>
          <div role="rowheader" className="flex items-center justify-between gap-2 px-3 py-2.5 font-medium text-slate-300">
            <span>{row.label}</span>
            {row.difference !== 'same' ? <DifferenceBadge difference={row.difference} compact /> : null}
          </div>
          <div role="cell" className="break-all border-l border-slate-800 px-3 py-2.5 text-slate-200">{row.left}</div>
          <div role="cell" className="break-all border-l border-slate-800 px-3 py-2.5 text-slate-200">{row.right}</div>
        </div>
      ))}
    </div>
  </section>
);

const ComparisonTargetHeader = ({ label, log, disabled, onRemove }: { label: string; log: NetworkLog; disabled: boolean; onRemove: () => void }) => (
  <div className="min-w-0 space-y-2 bg-slate-950 px-5 py-3">
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs font-semibold text-cyan-200">{label}</p>
      <button type="button" disabled={disabled} aria-label={`${label}から通信を解除`} className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800 disabled:opacity-50" onClick={onRemove}>解除</button>
    </div>
    <p className="truncate text-xs text-slate-200" title={log.url}>{toPathLabel(log.url)}</p>
  </div>
);

const HeaderComparisonSection = ({ title, rows, hiddenByFilter }: { title: string; rows: HeaderComparisonRow[]; hiddenByFilter: boolean }) => {
  const hasDifferences = rows.some((row) => row.difference !== 'same');
  return (
    <section className="space-y-2" aria-label={`${title}の比較`}>
      <SectionTitle title={title} difference={hasDifferences} />
      {rows.length === 0 ? (
        <p className="rounded-lg border border-slate-800 px-3 py-4 text-xs text-slate-500">
          {hiddenByFilter ? '同一headerは「差分のみ」により非表示です。' : '両方の通信でheaderは取得されていません。'}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-800">
          <div className="grid grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)] bg-slate-900 text-[11px] font-medium text-slate-400">
            <div className="px-3 py-2">Header</div><div className="border-l border-slate-800 px-3 py-2">比較A</div><div className="border-l border-slate-800 px-3 py-2">比較B</div>
          </div>
          {rows.map((row) => (
            <div key={row.name} data-difference={row.difference} className={`grid grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)] border-t border-slate-800 text-xs ${differenceBackground(row.difference)}`}>
              <div className="flex items-center justify-between gap-2 break-all px-3 py-2.5 font-medium text-slate-300"><span>{row.name}</span>{row.difference !== 'same' ? <DifferenceBadge difference={row.difference} compact /> : null}</div>
              <div className="break-all border-l border-slate-800 px-3 py-2.5 text-slate-200">{row.left ?? '—'}</div>
              <div className="break-all border-l border-slate-800 px-3 py-2.5 text-slate-200">{row.right ?? '—'}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

const BodyComparisonSection = ({ title, comparison, kind }: { title: string; comparison: BodyComparison; kind: 'request' | 'response' }) => (
  <section className="space-y-2" aria-label={`${title}の比較`}>
    <SectionTitle title={title} difference={comparison.difference !== 'same'} />
    <div className={`grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-800 bg-slate-800 ${differenceBackground(comparison.difference)}`}>
      <BodyCard body={comparison.left} kind={kind} label="比較A" />
      <BodyCard body={comparison.right} kind={kind} label="比較B" />
    </div>
  </section>
);

const BodyCard = ({ body, kind, label }: { body: ComparableBody; kind: 'request' | 'response'; label: string }) => {
  const unavailableMessage = kind === 'request'
    ? formatRequestBodyUnavailableReason(body.unavailableReason as Parameters<typeof formatRequestBodyUnavailableReason>[0])
    : formatResponseBodyUnavailableReason(body.unavailableReason as Parameters<typeof formatResponseBodyUnavailableReason>[0]);
  return (
    <div className="min-w-0 space-y-3 bg-slate-950 p-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500"><span className="font-medium text-slate-300">{label}</span><span>{body.kind.toUpperCase()}</span>{typeof body.byteLength === 'number' ? <span>{body.byteLength} bytes</span> : null}{body.contentType ? <span className="break-all">{body.contentType}</span> : null}{body.isTruncated ? <span>先頭のみ</span> : null}</div>
      {body.state === 'none' ? <p className="text-xs text-slate-500">内容は取得されていません。</p> : body.state === 'unavailable' ? <p className="text-xs text-slate-500">{unavailableMessage}</p> : body.content ? <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-200">{body.content}</pre> : <p className="text-xs text-slate-500">表示可能な内容はありません。</p>}
      {body.redactedFieldPaths.length > 0 ? <p className="break-all text-[11px] text-amber-300">伏字項目: {body.redactedFieldPaths.join(', ')}</p> : null}
    </div>
  );
};

const SectionTitle = ({ id, title, difference }: { id?: string; title: string; difference: boolean }) => (
  <div className="flex items-center gap-2"><h3 id={id} className="text-sm font-semibold text-slate-200">{title}</h3><DifferenceBadge difference={difference ? 'different' : 'same'} compact /></div>
);

const DifferenceBadge = ({ difference, compact = false }: { difference: ComparisonDifferenceKind; compact?: boolean }) => {
  const tone = difference === 'same' ? 'border-emerald-800/60 bg-emerald-950/40 text-emerald-300' : 'border-amber-700/70 bg-amber-950/50 text-amber-200';
  return <span className={`shrink-0 rounded-full border ${tone} ${compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'}`}>{differenceLabel(difference)}</span>;
};

const differenceLabel = (difference: ComparisonDifferenceKind): string => difference === 'same' ? '同一' : difference === 'left-only' ? '比較Aのみ' : difference === 'right-only' ? '比較Bのみ' : '差分あり';
const differenceBackground = (difference: ComparisonDifferenceKind): string => difference === 'same' ? 'bg-slate-950' : 'bg-amber-950/20';
