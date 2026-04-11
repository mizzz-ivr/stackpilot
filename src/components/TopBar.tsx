import { useState } from 'react';
import { useAppStore } from '../store/appStore';

export const TopBar = () => {
  const navigate = useAppStore((s) => s.navigate);
  const openDevTools = useAppStore((s) => s.openDevTools);
  const activeWorkspace = useAppStore((s) => s.activeWorkspace);
  const [url, setUrl] = useState('https://example.com');

  const isProd = activeWorkspace?.prodDomains.some((d) => url.includes(d));

  return (
    <header className="flex h-[92px] flex-col gap-2 border-b border-slate-800 px-4 py-3">
      <div className="flex items-center gap-2">
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          className="flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2"
        />
        <button className="rounded bg-indigo-600 px-4 py-2" onClick={() => void navigate(url)}>Go</button>
        <button className="rounded bg-slate-700 px-4 py-2" onClick={() => void openDevTools()}>DevTools</button>
      </div>
      {isProd ? <div className="rounded bg-rose-900/70 px-3 py-1 text-xs">⚠ prod ドメインアクセス警告</div> : null}
    </header>
  );
};
