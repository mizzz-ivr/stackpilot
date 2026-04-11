import { randomUUID } from 'node:crypto';
import type { AppSnapshot, CreateWorkspaceInput, Workspace } from '../../../shared/contracts';
import type { EnvironmentType } from '../../../shared/domain/environment';
import { buildWorkspacePartition } from '../domain/partition';
import { JsonRepository } from '../persistence/jsonRepository';

interface LegacyWorkspace {
  environment?: EnvironmentType;
  environmentType?: EnvironmentType;
}

const normalizeSnapshot = (snapshot: AppSnapshot): AppSnapshot => ({
  ...snapshot,
  workspaces: snapshot.workspaces.map((workspace) => {
    const legacy = workspace as Workspace & LegacyWorkspace;
    return {
      ...workspace,
      environmentType: legacy.environmentType ?? legacy.environment ?? 'dev'
    };
  })
});

export class WorkspaceService {
  private snapshot: AppSnapshot = { version: 1, workspaces: [] };

  constructor(private readonly repository: JsonRepository<AppSnapshot>) {}

  async init(): Promise<void> {
    const loadedSnapshot = await this.repository.load();
    this.snapshot = normalizeSnapshot(loadedSnapshot);
  }

  list(): Workspace[] {
    return this.snapshot.workspaces;
  }

  getSnapshot(): AppSnapshot {
    return this.snapshot;
  }

  async create(input: CreateWorkspaceInput): Promise<Workspace> {
    const now = new Date().toISOString();
    const id = randomUUID();
    const workspace: Workspace = {
      id,
      name: input.name,
      environmentType: input.environmentType,
      customEnvironmentLabel: input.customEnvironmentLabel,
      prodDomains: input.prodDomains,
      partition: buildWorkspacePartition(id),
      tabs: [{ id: randomUUID(), title: 'New Tab', url: 'https://example.com', isActive: true }],
      createdAt: now,
      updatedAt: now
    };

    this.snapshot.workspaces.push(workspace);
    this.snapshot.activeWorkspaceId = workspace.id;
    await this.repository.save(this.snapshot);
    return workspace;
  }

  async update(workspaceId: string, patch: Partial<Workspace>): Promise<Workspace | null> {
    const workspace = this.snapshot.workspaces.find((item) => item.id === workspaceId);
    if (!workspace) return null;

    Object.assign(workspace, patch, { updatedAt: new Date().toISOString() });
    await this.repository.save(this.snapshot);
    return workspace;
  }

  async remove(workspaceId: string): Promise<boolean> {
    const before = this.snapshot.workspaces.length;
    this.snapshot.workspaces = this.snapshot.workspaces.filter((item) => item.id !== workspaceId);
    if (before === this.snapshot.workspaces.length) return false;

    if (this.snapshot.activeWorkspaceId === workspaceId) {
      this.snapshot.activeWorkspaceId = this.snapshot.workspaces[0]?.id;
    }

    await this.repository.save(this.snapshot);
    return true;
  }

  async persistTabs(workspaceId: string, tabs: Workspace['tabs']): Promise<void> {
    const workspace = this.snapshot.workspaces.find((item) => item.id === workspaceId);
    if (!workspace) return;
    workspace.tabs = tabs;
    workspace.updatedAt = new Date().toISOString();
    await this.repository.save(this.snapshot);
  }
}
