import type {
  ApiLogExportCustomMaskingRules
} from '../../shared/domain/apiLogExportCustomMasking';
import type {
  ApiLogExportMaskingReport,
  ApiLogExportPreview,
  ApiLogExportPreviewEntry
} from '../../shared/domain/apiLogExportPreview';
import { getStatusTone } from '../../shared/domain/inspector';

const bodyStateLabels = {
  included: '含む',
  unavailable: '取得不可',
  'not-captured': '未取得'
} as const;

export interface ApiLogExportMaskingDraft {
  queryNamesText: string;
  headerNamesText: string;
  bodyFieldNamesText: string;
}

export type ApiLogExportFeedback = {
  kind: 'success' | 'info' | 'error';
  message: string;
};

interface ApiLogExportPreviewDialogProps {
  preview: ApiLogExportPreview;
  maskingDraft: ApiLogExportMaskingDraft;
  isSaving: boolean;
  isRefreshing: boolean;
  hasUnappliedRuleChanges: boolean;
  feedback?: ApiLogExportFeedback;
  onMaskingDraftChange: (draft: ApiLogExportMaskingDraft) => void;
  onApplyRules: () => void;
  onClearRules: () => void;
  onClose: () => void;
  onSave: () => void;
}

export const ApiLogExportPreviewDialog = ({
  preview,
  maskingDraft,
  isSaving,
  isRefreshing,
  hasUnappliedRuleChanges,
  feedback,
  onMaskingDraftChange,
  onApplyRules,
  onClearRules,
  onClose,
  onSave
}: ApiLogExportPreviewDialogProps) => {
  const isBusy = isSaving || isRefreshing;
  const appliedRuleCount = countRules(preview.customMaskingRules);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isBusy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-log-export-preview-title"
        className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="api-log-export-preview-title" className="text-base font-semibold text-slate-100">
                保存前プレビュー
              </h2>
              <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-xs font-semibold uppercase text-indigo-200">
                {preview.format}
              </span>
              {appliedRuleCount > 0 ? (
                <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
                  追加ルール {appliedRuleCount}件適用中
                </span>
              ) : null}
            </div>
            <p className="text-xs text-slate-400">
              {preview.workspace.name} · {preview.filterKind} · {preview.exportedCount}件
              {preview.omittedCount > 0 ? `（${preview.omittedCount}件省略）` : ''}
            </p>
          </div>
          <button
            type="button"
            disabled={isBusy}
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

          <CustomMaskingEditor
            draft={maskingDraft}
            appliedRules={preview.customMaskingRules}
            isBusy={isBusy}
            hasUnappliedRuleChanges={hasUnappliedRuleChanges}
            onChange={onMaskingDraftChange}
            onApply={onApplyRules}
            onClear={onClearRules}
          />

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
              <li>追加ルールはこのプレビューだけに適用され、設定や端末には保存されません。</li>
              <li>URL pathへ直接埋め込まれたtokenやIDは追加ルールの対象外です。</li>
              <li>値ベース・正規表現による置換は行いません。項目名が一致した値だけを伏字化します。</li>
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
                  : feedback.kind === 'success'
                    ? 'border-emerald-800/60 bg-emerald-950/40 text-emerald-200'
                    : 'border-slate-700 bg-slate-950/70 text-slate-300'
              }`}
            >
              {feedback.message}
            </p>
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 px-5 py-4">
          <p className="text-[11px] text-slate-500">
            {hasUnappliedRuleChanges
              ? '追加ルールの入力変更を再プレビューへ反映してから保存してください。'
              : `確認済みの追加ルール: ${appliedRuleCount}件`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isBusy}
              className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-40"
              onClick={onClose}
            >
              キャンセル
            </button>
            <button
              type="button"
              disabled={isBusy || hasUnappliedRuleChanges}
              aria-busy={isSaving}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onSave}
            >
              {isSaving ? '保存中…' : 'この内容を保存'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

const CustomMaskingEditor = ({
  draft,
  appliedRules,
  isBusy,
  hasUnappliedRuleChanges,
  onChange,
  onApply,
  onClear
}: {
  draft: ApiLogExportMaskingDraft;
  appliedRules: ApiLogExportCustomMaskingRules;
  isBusy: boolean;
  hasUnappliedRuleChanges: boolean;
  onChange: (draft: ApiLogExportMaskingDraft) => void;
  onApply: () => void;
  onClear: () => void;
}) => {
  const appliedRuleCount = countRules(appliedRules);

  return (
    <section className="space-y-3 rounded-xl border border-indigo-800/50 bg-indigo-950/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-indigo-100">追加マスキング</h3>
          <p className="text-[11px] leading-5 text-slate-400">
            カンマまたは改行区切りで項目名を指定します。大文字小文字、`-`、`_`、camelCaseの差異を正規化して照合します。
          </p>
        </div>
        <span className="text-[11px] text-indigo-200">適用中 {appliedRuleCount}件</span>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <MaskingRuleInput
          label="URL query名"
          value={draft.queryNamesText}
          placeholder={'customer_id, email\ntrackingCode'}
          disabled={isBusy}
          onChange={(value) => onChange({ ...draft, queryNamesText: value })}
        />
        <MaskingRuleInput
          label="Header名"
          value={draft.headerNamesText}
          placeholder={'x-customer-id\nx-internal-reference'}
          disabled={isBusy}
          onChange={(value) => onChange({ ...draft, headerNamesText: value })}
        />
        <MaskingRuleInput
          label="JSON / formフィールド名"
          value={draft.bodyFieldNamesText}
          placeholder={'email, employeeId\nprofileCode'}
          disabled={isBusy}
          onChange={(value) => onChange({ ...draft, bodyFieldNamesText: value })}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={hasUnappliedRuleChanges ? 'text-[11px] text-amber-300' : 'text-[11px] text-slate-500'}>
          {hasUnappliedRuleChanges ? '入力内容はまだ成果物へ反映されていません。' : '入力内容は現在のプレビューへ反映済みです。'}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isBusy || (appliedRuleCount === 0 && !hasUnappliedRuleChanges)}
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40"
            onClick={onClear}
          >
            追加ルールを解除して再プレビュー
          </button>
          <button
            type="button"
            disabled={isBusy || !hasUnappliedRuleChanges}
            aria-busy={isBusy}
            className="rounded-lg bg-indigo-500 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-400 disabled:opacity-40"
            onClick={onApply}
          >
            {isBusy ? '再生成中…' : '追加ルールで再プレビュー'}
          </button>
        </div>
      </div>
    </section>
  );
};

const MaskingRuleInput = ({
  label,
  value,
  placeholder,
  disabled,
  onChange
}: {
  label: string;
  value: string;
  placeholder: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) => (
  <label className="space-y-1.5 text-xs text-slate-300">
    <span className="font-medium">{label}</span>
    <textarea
      rows={3}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs leading-5 text-slate-100 outline-none placeholder:text-slate-600 focus:border-indigo-500 disabled:opacity-50"
      onChange={(event) => onChange(event.target.value)}
    />
  </label>
);

const MaskingReport = ({ report }: { report: ApiLogExportMaskingReport }) => {
  const groups = [
    {
      title: 'URL',
      items: [
        ['認証情報を除去', report.urlUserInfoRemoved],
        ['不正URLを非公開化', report.invalidUrlsRedacted],
        ['fragmentを伏字化', report.urlFragmentsRedacted],
        ['自動判定queryを伏字化', report.sensitiveQueryValuesRedacted],
        ['追加queryを伏字化', report.custom.queryValuesRedacted]
      ]
    },
    {
      title: 'Headers',
      items: [
        ['Request値を自動伏字化', report.requestHeaderValuesRedacted],
        ['Response値を自動伏字化', report.responseHeaderValuesRedacted],
        ['Request追加伏字', report.custom.requestHeaderValuesRedacted],
        ['Response追加伏字', report.custom.responseHeaderValuesRedacted],
        ['URL値を再安全化', report.requestUrlHeaderValuesSanitized + report.responseUrlHeaderValuesSanitized]
      ]
    },
    {
      title: 'Bodies / Errors',
      items: [
        ['Request自動伏字フィールド', report.requestBodyFieldsRedacted],
        ['Response自動伏字フィールド', report.responseBodyFieldsRedacted],
        ['Request追加伏字フィールド', report.custom.requestBodyFieldsRedacted],
        ['Response追加伏字フィールド', report.custom.responseBodyFieldsRedacted],
        ['body取得不可', report.requestBodiesUnavailable + report.responseBodiesUnavailable],
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
            {' · '}headers自動伏字 {entry.requestHeaderValuesRedacted + entry.responseHeaderValuesRedacted}件
            {' · '}body自動伏字 {entry.requestBodyFieldsRedacted + entry.responseBodyFieldsRedacted}件
          </p>
        </div>
      ))}
    </div>
  );
};

const PreviewMetric = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
    <p className="text-[10px] text-slate-500">{label}</p>
    <p className="mt-1 break-all text-xs font-medium text-slate-200">{value}</p>
  </div>
);

const countRules = (rules: ApiLogExportCustomMaskingRules): number =>
  rules.queryNames.length + rules.headerNames.length + rules.bodyFieldNames.length;

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
