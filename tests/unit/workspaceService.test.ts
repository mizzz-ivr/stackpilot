import { describe, expect, it } from 'vitest';
import { WorkspaceService } from '../../electron/main/services/workspaceService';
import type { AppSnapshot } from '../../shared/contracts';
import { buildWorkspacePartitionKey } from '../../shared/domain/partition';

class InMemoryRepository {
  constructor(private snapshot: AppSnapshot) {}

  async load(): Promise<AppSnapshot> {
    return this.snapshot;
  }

  async save(snapshot: AppSnapshot): Promise<void> {
    this.snapshot = structuredClone(snapshot);
  }
}

describe('WorkspaceService', () => {
  it('legacy partition を partitionKey に移行して active ids を正規化する', async () => {
    const repository = new InMemoryRepository({
      version: 1,
      activeWorkspaceId: 'w1',
      workspaces: [
        {
          id: 'w1',
          name: 'W1',
          environmentType: 'dev',
          prodDomains: [],
          partition: 'persist:workspace-w1',
          tabs: [
            { id: 't1', title: 'tab', url: 'https://a.test', isActive: false },
            { id: 't2', title: 'tab2', url: 'https://b.test', isActive: false }
          ],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z'
        }
      ]
    } as unknown as AppSnapshot);

    const service = new WorkspaceService(repository as never);
    await service.init();

    const snapshot = service.getSnapshot();
    expect(snapshot.workspaces[0].partitionKey).toBe('persist:workspace-w1');
    expect(snapshot.activeWorkspaceId).toBe('w1');
    expect(snapshot.activeTabId).toBe('t1');
    expect(snapshot.workspaces[0].tabs.some((tab) => tab.isActive)).toBe(true);
  });

  it('workspace 切替で activeWorkspaceId / activeTabId が同時に切り替わる', async () => {
    const repository = new InMemoryRepository({ version: 1, workspaces: [] });
    const service = new WorkspaceService(repository as never);
    await service.init();

    const w1 = await service.create({ name: 'W1', environmentType: 'dev', prodDomains: [] });
    const w2 = await service.create({ name: 'W2', environmentType: 'stg', prodDomains: [] });

    await service.switchWorkspace(w1.id);
    const snapshot = service.getSnapshot();

    expect(snapshot.activeWorkspaceId).toBe(w1.id);
    expect(snapshot.activeTabId).toBe(w1.tabs[0].id);
    expect(w2.partitionKey).toBe(buildWorkspacePartitionKey(w2.id));
  });
});
