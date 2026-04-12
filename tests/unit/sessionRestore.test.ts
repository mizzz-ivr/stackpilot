import { describe, expect, it } from 'vitest';
import { buildWorkspacePartition } from '../../shared/domain/partition';
import { restoreSessionSnapshot } from '../../shared/domain/sessionRestore';

describe('session restore', () => {
  it('schema validation: 破損データは空スナップショットにフォールバック', () => {
    const restored = restoreSessionSnapshot('broken-json');
    expect(restored.restored).toBe(false);
    expect(restored.snapshot.workspaces).toEqual([]);
    expect(restored.warnings).toContain('snapshot:invalid-root');
  });

  it('activeWorkspaceId の不整合は先頭workspaceへフォールバック', () => {
    const restored = restoreSessionSnapshot({
      version: 2,
      activeWorkspaceId: 'missing-workspace',
      workspaces: [
        {
          id: 'w1',
          name: 'Workspace 1',
          environmentType: 'dev',
          partitionKey: 'persist:workspace-w1',
          tabs: [{ id: 't1', title: 'tab', url: 'https://example.com', isActive: true, workspaceId: 'w1' }],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          prodDomains: []
        }
      ]
    });

    expect(restored.snapshot.activeWorkspaceId).toBe('w1');
    expect(restored.warnings).toContain('snapshot:activeWorkspaceId-fallback');
  });

  it('activeTabId の不整合は対象workspaceのactiveタブへフォールバック', () => {
    const restored = restoreSessionSnapshot({
      version: 2,
      activeWorkspaceId: 'w1',
      activeTabId: 'missing-tab',
      workspaces: [
        {
          id: 'w1',
          name: 'Workspace 1',
          environmentType: 'dev',
          partitionKey: 'persist:workspace-w1',
          tabs: [{ id: 't1', title: 'tab', url: 'https://example.com', isActive: true, workspaceId: 'w1' }],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          prodDomains: []
        }
      ]
    });

    expect(restored.snapshot.activeTabId).toBe('t1');
    expect(restored.warnings).toContain('snapshot:activeTabId-fallback');
  });

  it('partitionKey 欠損時はworkspaceIdベースで再生成する', () => {
    const restored = restoreSessionSnapshot({
      version: 2,
      workspaces: [
        {
          id: 'w1',
          name: 'Workspace 1',
          environmentType: 'dev',
          tabs: [{ id: 't1', title: 'tab', url: 'https://example.com', isActive: true }],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          prodDomains: []
        }
      ]
    });

    expect(restored.snapshot.workspaces[0]?.partitionKey).toBe(buildWorkspacePartition('w1'));
    expect(restored.warnings).toContain('workspace:w1:partitionKey-regenerated');
  });

  it('version 不整合は安全に初期化する', () => {
    const restored = restoreSessionSnapshot({
      version: 999,
      workspaces: []
    });

    expect(restored.restored).toBe(false);
    expect(restored.snapshot.workspaces).toEqual([]);
    expect(restored.warnings).toContain('snapshot:unsupported-version');
  });

  it('不正な environmentType は dev に補正する', () => {
    const restored = restoreSessionSnapshot({
      version: 2,
      workspaces: [
        {
          id: 'w1',
          name: 'Workspace 1',
          environmentType: 'invalid-env',
          partitionKey: 'persist:workspace-w1',
          tabs: [{ id: 't1', title: 'tab', url: 'https://example.com', isActive: true, workspaceId: 'w1' }],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          prodDomains: []
        }
      ]
    });

    expect(restored.snapshot.workspaces[0]?.environmentType).toBe('dev');
    expect(restored.warnings).toContain('workspace:w1:invalid-environmentType');
  });
});
