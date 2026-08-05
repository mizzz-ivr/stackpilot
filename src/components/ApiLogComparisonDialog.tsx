import { useEffect, useMemo, useRef } from 'react';
import {
  compareNetworkLogs,
  type BodyComparison,
  type ComparableBody,
  type ComparisonDifferenceKind,
  type HeaderComparisonRow
} from '../../shared/domain/apiLogComparison';
import { toPathLabel, type NetworkLog } from '../../shared/domain/inspector';
import { formatRequestBodyUnavailableReason } from '../../shared/domain/requestBody';
import { formatResponseBodyUnavailableReason } from '../../shared/domain/responseBody';

interface ApiLogComparisonDialogProps {
  left: NetworkLog;
  right: NetworkLog;
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
  onRemove,
  onClear,
  onClose
}: ApiLogComparisonDialogProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const comparison = useMemo(() => compareNetworkLogs(left, right), [left, right]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-log-comparison-title"
        className="flex max-h-[92vh] w-full max-w-[1200px] flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="api-log-comparison-title" className="text-base font-semibold text-slate-100">API通信比較</h2>
              <DifferenceBadge difference={comparison.hasDifferences ? 'different' : 'same'} />
            </div>
            <p className="text-xs text-slate-400">現在保持している安全化済みログだけを比較しています。外部送信やrawデータの再取得は行いません。</p>
          </div>
          <button
            type="button"
            autoFocus
            aria-label="API通信比較を閉じる"
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
            onClick={onClose}
          >
            閉じる
          </button>
        </header>

        <div className="grid grid-cols-2 gap-px border-b border-slate-800 bg-slate-800">
          <ComparisonTargetHeader label="比較A" log={left} onRemove={() => onRemove(left.id)} />
          <ComparisonTargetHeader label="比較B" log={right} onRemove={() => onRemove(right.id)} />
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-auto px-5 py-5">
          <section className="space-y-2" aria-labelledby="comparison-summary-title">
            <SectionTitle id="comparison-summary-title" title="概要" difference={comparison.summary.some((row) => row.difference !== 'same')} />
            <div role="table" aria-label="通信概要の比較" className="overflow-hidden rounded-lg border border-slate-800">
              <div role="row" className="grid grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)] bg-slate-900 text-[11px] font-medium text-slate-400">
                <div role="columnheader" className="px-3 py-2">項目</div>
                <div role="columnheader" className="border-l border-slate-800 px-3 py-2">比較A</div>
                <div role="columnheader" className="border-l border-slate-800 px-3 py-2">比較B</div>
              </div>
              {comparison.summary.map((row) => (
                <div
                  key={row.key}
                  role="row"
                  data-difference={row.difference}
                  className={`grid grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)] border-t border-slate-800 text-xs ${differenceBackground(row.difference)}`}
                >
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

          <HeaderComparisonSection title="Request headers" rows={comparison.requestHeaders} />
          <BodyComparisonSection title="Request body" comparison={comparison.requestBody} kind="request" />
          <HeaderComparisonSection title="Response headers" rows={comparison.responseHeaders} />
          <BodyComparisonSection title="Response body" comparison={comparison.responseBody} kind="response" />
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 px-5 py-3">
          <p className="text-[11px] text-slate-500">比較対象は現在のWorkspace内だけで保持され、再読み込みやWorkspace切替で破棄されます。</p>
          <button
            type="button"
            className="rounded-lg border border-rose-800/70 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-950/40"
            onClick={onClear}
          >
            比較対象をすべて解除
          </button>
        </footer>
      </div>
    </div>
  );
};

const ComparisonTargetHeader = ({
  label,
  log,
  onRemove
}: {
  label: string;
  log: NetworkLog;
  onRemove: () => void;
}) => (
  <div className="min-w-0 space-y-2 bg-slate-950 px-5 py-3">
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs font-semibold text-cyan-200">{label}</p>
      <button
        type="button"
        aria-label={`${label}から通信を解除`}
        className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
        onClick={onRemove}
      >
        解除
      </button>
    </div>
    <p className="truncate text-xs text-slate-200" title={log.url}>{toPathLabel(log.url)}</p>
  </div>
);

const HeaderComparisonSection = ({ title, rows }: { title: string; rows: HeaderComparisonRow[] }) => {
  const hasDifferences = rows.some((row) => row.difference !== 'same');
  return (
    <section className="space-y-2" aria-label={`${title}の比較`}>
      <SectionTitle title={title} difference={hasDifferences} />
      {rows.length === 0 ? (
        <p className="rounded-lg border border-slate-800 px-3 py-4 text-xs text-slate-500">両方の通信でheaderは取得されていません。</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-800">
          <div className="grid grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)] bg-slate-900 text-[11px] font-medium text-slate-400">
            <div className="px-3 py-2">Header</div>
            <div className="border-l border-slate-800 px-3 py-2">比較A</div>
            <div className="border-l border-slate-800 px-3 py-2">比較B</div>
          </div>
          {rows.map((row) => (
            <div
              key={row.name}
              data-difference={row.difference}
              className={`grid grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)] border-t border-slate-800 text-xs ${differenceBackground(row.difference)}`}
            >
              <div className="flex items-center justify-between gap-2 break-all px-3 py-2.5 font-medium text-slate-300">
                <span>{row.name}</span>
                {row.difference !== 'same' ? <DifferenceBadge difference={row.difference} compact /> : null}
              </div>
              <div className="break-all border-l border-slate-800 px-3 py-2.5 text-slate-200">{row.left ?? '—'}</div>
              <div className="break-all border-l border-slate-800 px-3 py-2.5 text-slate-200">{row.right ?? '—'}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

const BodyComparisonSection = ({
  title,
  comparison,
  kind
}: {
  title: string;
  comparison: BodyComparison;
  kind: 'request' | 'response';
}) => (
  <section className="space-y-2" aria-label={`${title}の比較`}>
    <SectionTitle title={title} difference={comparison.difference !== 'same'} />
    <div className={`grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-800 bg-slate-800 ${differenceBackground(comparison.difference)}`}>
      <BodyCard body={comparison.left} kind={kind} label="比較A" />
      <BodyCard body={comparison.right} kind={kind} label="比較B" />
    </div>
  </section>
);

const BodyCard = ({
  body,
  kind,
  label
}: {
  body: ComparableBody;
  kind: 'request' | 'response';
  label: string;
}) => {
  const unavailableMessage = kind === 'request'
    ? formatRequestBodyUnavailableReason(body.unavailableReason as Parameters<typeof formatRequestBodyUnavailableReason>[0])
    : formatResponseBodyUnavailableReason(body.unavailableReason as Parameters<typeof formatResponseBodyUnavailableReason>[0]);

  return (
    <div className="min-w-0 space-y-3 bg-slate-950 p-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
        <span className="font-medium text-slate-300">{label}</span>
        <span>{body.kind.toUpperCase()}</span>
        {typeof body.byteLength === 'number' ? <span>{body.byteLength} bytes</span> : null}
        {body.contentType ? <span className="break-all">{body.contentType}</span> : null}
        {body.isTruncated ? <span>先頭のみ</span> : null}
      </div>

      {body.state === 'none' ? (
        <p className="text-xs text-slate-500">内容は取得されていません。</p>
      ) : body.state === 'unavailable' ? (
        <p className="text-xs text-slate-500">{unavailableMessage}</p>
      ) : body.content ? (
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-200">{body.content}</pre>
      ) : (
        <p className="text-xs text-slate-500">表示可能な内容はありません。</p>
      )}

      {body.redactedFieldPaths.length > 0 ? (
        <p className="break-all text-[11px] text-amber-300">伏字項目: {body.redactedFieldPaths.join(', ')}</p>
      ) : null}
    </div>
  );
};

const SectionTitle = ({
  id,
  title,
  difference
}: {
  id?: string;
  title: string;
  difference: boolean;
}) => (
  <div className="flex items-center gap-2">
    <h3 id={id} className="text-sm font-semibold text-slate-200">{title}</h3>
    <DifferenceBadge difference={difference ? 'different' : 'same'} compact />
  </div>
);

const DifferenceBadge = ({
  difference,
  compact = false
}: {
  difference: ComparisonDifferenceKind;
  compact?: boolean;
}) => {
  const label = differenceLabel(difference);
  const tone = difference === 'same'
    ? 'border-emerald-800/60 bg-emerald-950/40 text-emerald-300'
    : 'border-amber-700/70 bg-amber-950/50 text-amber-200';
  return (
    <span className={`shrink-0 rounded-full border ${tone} ${compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'}`}>
      {label}
    </span>
  );
};

const differenceLabel = (difference: ComparisonDifferenceKind): string => {
  if (difference === 'same') return '同一';
  if (difference === 'left-only') return '比較Aのみ';
  if (difference === 'right-only') return '比較Bのみ';
  return '差分あり';
};

const differenceBackground = (difference: ComparisonDifferenceKind): string =>
  difference === 'same' ? 'bg-slate-950' : 'bg-amber-950/20';
