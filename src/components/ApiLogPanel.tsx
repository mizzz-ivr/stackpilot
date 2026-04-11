import { useMemo, useState } from 'react';
import { useAppStore } from '../store/appStore';

export const ApiLogPanel = () => {
  const logs = useAppStore((s) => s.apiLogs);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'all' | 'xhr' | 'fetch'>('all');

  const filtered = useMemo(
    () =>
      logs.filter((log) => {
        const matchType = type === 'all' ? true : log.type === type;
        const q = `${log.url} ${log.method} ${log.status}`.toLowerCase();
        return matchType && q.includes(search.toLowerCase());
      }),
    [logs, search, type]
  );

  return (
    <section className="h-[320px] border-t border-slate-800 p-3">
      <div className="mb-2 flex items-center gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} className="rounded bg-slate-900 px-2 py-1" placeholder="Search" />
        <select value={type} onChange={(e) => setType(e.target.value as 'all' | 'xhr' | 'fetch')} className="rounded bg-slate-900 px-2 py-1">
          <option value="all">all</option>
          <option value="xhr">xhr</option>
          <option value="fetch">fetch</option>
        </select>
      </div>
      <div className="overflow-auto text-xs">
        <table className="w-full">
          <thead>
            <tr className="text-slate-400"><th>Method</th><th>Status</th><th>Duration</th><th>URL</th></tr>
          </thead>
          <tbody>
            {filtered.map((log) => (
              <tr key={log.id} className="border-t border-slate-800"><td>{log.method}</td><td>{log.status}</td><td>{log.durationMs}ms</td><td>{log.url}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
