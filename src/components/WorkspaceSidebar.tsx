import { useState } from 'react';
import { environmentTypes } from '../../shared/domain/environment';
import { EnvironmentBadge } from './EnvironmentBadge';
import { useAppStore } from '../store/appStore';

export const WorkspaceSidebar = () => {
  const snapshot = useAppStore((s) => s.snapshot);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const switchingWorkspaceId = useAppStore((s) => s.switchingWorkspaceId);
  const selectWorkspace = useAppStore((s) => s.selectWorkspace);
  const createWorkspace = useAppStore((s) => s.createWorkspace);

  const [workspaceName, setWorkspaceName] = useState('');
  const [environmentType, setEnvironmentType] = useState<(typeof environmentTypes)[number]>('dev');

  const hasWorkspaces = (snapshot?.workspaces.length ?? 0) > 0;

  const handleCreateWorkspace = async () => {
    if (!workspaceName.trim()) return;
    await createWorkspace({ name: workspaceName.trim(), environmentType });
    setWorkspaceName('');
    setEnvironmentType('dev');
  };

  return (
    <aside className="w-80 border-r border-slate-800 bg-slate-950/70 p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Workspaces</h2>
        <p className="mt-1 text-xs text-slate-400">環境分離された開発セッションを切り替えます。</p>
      </div>

      <div className="mb-4 space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
        <input
          value={workspaceName}
          onChange={(event) => setWorkspaceName(event.target.value)}
          className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"
          placeholder="新規Workspace名"
        />
        <div className="flex gap-2">
          <select
            value={environmentType}
            onChange={(event) => setEnvironmentType(event.target.value as (typeof environmentTypes)[number])}
            className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"
          >
            {environmentTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <button onClick={() => void handleCreateWorkspace()} className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium">
            作成
          </button>
        </div>
      </div>

      {!hasWorkspaces ? (
        <div className="rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-400">
          Workspace がありません。上のフォームから作成してください。
        </div>
      ) : (
        <div className="space-y-2">
          {snapshot?.workspaces.map((workspace) => {
            const isActive = activeWorkspaceId === workspace.id;
            const isSwitching = switchingWorkspaceId === workspace.id;

            return (
              <button
                key={workspace.id}
                onClick={() => void selectWorkspace(workspace.id)}
                disabled={Boolean(switchingWorkspaceId)}
                className={`w-full rounded border p-3 text-left transition ${
                  isActive ? 'border-indigo-500 bg-slate-900' : 'border-slate-700 hover:border-slate-500'
                } ${isSwitching ? 'animate-pulse' : ''}`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{workspace.name}</span>
                  <EnvironmentBadge environmentType={workspace.environmentType} />
                </div>
                <div className="text-xs text-slate-400">partition: {workspace.partitionKey}</div>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
};
