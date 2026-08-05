import {
  hasActiveInspectorFilters,
  type InspectorFilter,
  type InspectorMethodFilterKind,
  type InspectorStatusFilterKind
} from '../../shared/domain/inspector';

const resourceKinds: Array<{ value: InspectorFilter['kind']; label: string }> = [
  { value: 'all', label: 'すべて' },
  { value: 'xhr', label: 'XHR' },
  { value: 'fetch', label: 'fetch' }
];

const methodOptions: Array<{ value: InspectorMethodFilterKind; label: string }> = [
  { value: 'all', label: '全method' },
  { value: 'GET', label: 'GET' },
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
  { value: 'PATCH', label: 'PATCH' },
  { value: 'DELETE', label: 'DELETE' },
  { value: 'OTHER', label: 'その他' }
];

const statusOptions: Array<{ value: InspectorStatusFilterKind; label: string }> = [
  { value: 'all', label: '全status' },
  { value: 'success', label: '2xx' },
  { value: 'redirect', label: '3xx' },
  { value: 'client-error', label: '4xx' },
  { value: 'server-error', label: '5xx' },
  { value: 'failed', label: '通信失敗' }
];

interface ApiLogFilterToolbarProps {
  filter: InspectorFilter;
  totalCount: number;
  visibleCount: number;
  pinnedCount: number;
  disabled?: boolean;
  onResourceKindChange: (kind: InspectorFilter['kind']) => void;
  onQueryChange: (query: string) => void;
  onMethodChange: (method: InspectorMethodFilterKind) => void;
  onStatusChange: (status: InspectorStatusFilterKind) => void;
  onTogglePinnedOnly: () => void;
  onReset: () => void;
}

export const ApiLogFilterToolbar = ({
  filter,
  totalCount,
  visibleCount,
  pinnedCount,
  disabled = false,
  onResourceKindChange,
  onQueryChange,
  onMethodChange,
  onStatusChange,
  onTogglePinnedOnly,
  onReset
}: ApiLogFilterToolbarProps) => {
  const hasActiveFilters = hasActiveInspectorFilters(filter);

  return (
    <div className="space-y-2" aria-label="API通信の検索と絞り込み">
      <div className="flex items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">API通信を検索</span>
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            aria-label="API通信を検索"
            value={filter.query}
            disabled={disabled}
            placeholder="URL・method・headerを検索"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-8 pr-8 text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 disabled:opacity-50"
            onChange={(event) => onQueryChange(event.target.value)}
          />
          {filter.query ? (
            <button
              type="button"
              aria-label="検索キーワードを消去"
              disabled={disabled}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-40"
              onClick={() => onQueryChange('')}
            >
              <CloseIcon className="h-3 w-3" />
            </button>
          ) : null}
        </label>

        <button
          type="button"
          disabled={disabled || !hasActiveFilters}
          className="shrink-0 rounded-lg border border-slate-700 px-2.5 py-2 text-[11px] font-medium text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-35"
          onClick={onReset}
        >
          解除
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {resourceKinds.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-pressed={filter.kind === option.value}
            className={`rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-40 ${
              filter.kind === option.value
                ? 'bg-indigo-500/25 text-indigo-200 ring-1 ring-indigo-400/30'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            onClick={() => onResourceKindChange(option.value)}
          >
            {option.label}
          </button>
        ))}

        <label className="sr-only" htmlFor="api-log-method-filter">methodで絞り込み</label>
        <select
          id="api-log-method-filter"
          value={filter.method}
          disabled={disabled}
          className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-300 outline-none focus:border-indigo-500 disabled:opacity-40"
          onChange={(event) => onMethodChange(event.target.value as InspectorMethodFilterKind)}
        >
          {methodOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>

        <label className="sr-only" htmlFor="api-log-status-filter">statusで絞り込み</label>
        <select
          id="api-log-status-filter"
          value={filter.status}
          disabled={disabled}
          className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-300 outline-none focus:border-indigo-500 disabled:opacity-40"
          onChange={(event) => onStatusChange(event.target.value as InspectorStatusFilterKind)}
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>

        <button
          type="button"
          disabled={disabled || pinnedCount === 0}
          aria-pressed={filter.pinnedOnly}
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
            filter.pinnedOnly
              ? 'border-amber-500/50 bg-amber-500/15 text-amber-200'
              : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200'
          }`}
          onClick={onTogglePinnedOnly}
        >
          <PinIcon className="h-3 w-3" filled={filter.pinnedOnly} />
          ピン {pinnedCount}
        </button>

        <span className="ml-auto text-[10px] tabular-nums text-slate-500" aria-live="polite">
          {visibleCount} / {totalCount}件
        </span>
      </div>
    </div>
  );
};

export const PinIcon = ({
  className,
  filled = false
}: {
  className?: string;
  filled?: boolean;
}) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M8.6 3.5h6.8l-.8 5.1 3.2 3.2v1.7H6.2v-1.7l3.2-3.2-.8-5.1Z" />
    <path d="M12 13.5v7" />
  </svg>
);

const SearchIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </svg>
);

const CloseIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="m7 7 10 10M17 7 7 17" />
  </svg>
);
