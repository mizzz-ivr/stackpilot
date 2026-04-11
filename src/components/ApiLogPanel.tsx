import { useMemo } from 'react';
import {
  formatDurationLabel,
  formatMethodLabel,
  getStatusTone,
  toPathLabel,
  type InspectorFilter
} from '../../shared/domain/inspector';
import { selectFilteredLogs, useAppStore } from '../store/appStore';

const filterButtons: InspectorFilter['kind'][] = ['all', 'xhr', 'fetch'];

export const ApiLogPanel = () => {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const { filter, isLoading, errorMessage, logs } = useAppStore((s) => s.inspector);
  const setInspectorFilter = useAppStore((s) => s.setInspectorFilter);
  const filtered = useAppStore(selectFilteredLogs);

  const emptyLabel = useMemo(() => {
    if (!activeWorkspaceId) return 'ワークスペースを選択してください';
    if (isLoading) return 'APIログを読み込み中です';
    if (logs.length === 0) return 'ログ未取得: XHR / fetch 通信を待っています';
    if (filtered.length === 0) return `通信なし: ${filter.kind} に一致するログはありません`;
    return undefined;
  }, [activeWorkspaceId, filter.kind, filtered.length, isLoading, logs.length]);

  return (
    <aside className="flex h-full w-[360px] flex-col border-l border-slate-800 bg-slate-950/80">
      <div className="border-b border-slate-800 px-3 py-2">
        <h2 className="text-sm font-semibold text-slate-100">API Inspector</h2>
        <p className="text-xs text-slate-400">XHR / fetch を優先表示</p>
      </div>

      <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2">
        {filterButtons.map((kind) => (
          <button
            key={kind}
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

      {emptyLabel ? (
        <div className="px-3 py-6 text-xs text-slate-400">{emptyLabel}</div>
      ) : (
        <div className="flex-1 overflow-auto px-2 py-2">
          <table className="w-full table-fixed text-xs">
            <thead>
              <tr className="text-slate-400">
                <th className="w-14 text-left">Method</th>
                <th className="w-10 text-left">St</th>
                <th className="w-14 text-left">Time</th>
                <th className="text-left">Path / URL</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log) => (
                <tr key={log.id} className="border-t border-slate-800 align-top">
                  <td className="py-1 text-slate-200">{formatMethodLabel(log.method)}</td>
                  <td className={`py-1 ${getStatusTone(log.status)}`}>{log.status ?? '-'}</td>
                  <td className="py-1 text-slate-300">{formatDurationLabel(log.durationMs)}</td>
                  <td className="truncate py-1 text-slate-300" title={log.url}>
                    {toPathLabel(log.url)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </aside>
  );
};
