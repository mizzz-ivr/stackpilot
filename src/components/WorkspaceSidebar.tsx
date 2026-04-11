import { useAppStore } from '../store/appStore';

const labelColor: Record<string, string> = {
  local: 'bg-emerald-600',
  dev: 'bg-cyan-600',
  stg: 'bg-amber-600',
  prod: 'bg-rose-700',
  custom: 'bg-violet-600'
};

export const WorkspaceSidebar = () => {
  const snapshot = useAppStore((s) => s.snapshot);
  const activeWorkspace = useAppStore((s) => s.activeWorkspace);
  const selectWorkspace = useAppStore((s) => s.selectWorkspace);
  const createWorkspace = useAppStore((s) => s.createWorkspace);

  return (
    <aside className="w-80 border-r border-slate-800 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Workspaces</h2>
        <button onClick={() => void createWorkspace()} className="rounded bg-indigo-600 px-3 py-1 text-sm">+</button>
      </div>
      <div className="space-y-2">
        {snapshot?.workspaces.map((workspace) => (
          <button
            key={workspace.id}
            onClick={() => void selectWorkspace(workspace.id)}
            className={`w-full rounded border p-3 text-left ${activeWorkspace?.id === workspace.id ? 'border-indigo-500 bg-slate-900' : 'border-slate-700'}`}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium">{workspace.name}</span>
              <span className={`rounded px-2 py-0.5 text-xs ${labelColor[workspace.environment]}`}>{workspace.environment}</span>
            </div>
            <div className="text-xs text-slate-400">partition: {workspace.partition}</div>
          </button>
        ))}
      </div>
    </aside>
  );
};
