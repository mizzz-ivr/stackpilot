import { randomUUID } from 'node:crypto';
import type { AppSnapshot, CreateWorkspaceInput, Workspace } from '../../../shared/contracts';
import type { EnvironmentType } from '../../../shared/domain/environment';
import { alignWorkspaceTabs, resolveWorkspaceActiveTabId } from '../../../shared/domain/workspace';
import { buildWorkspacePartitionKey } from '../../../shared/domain/partition';
import { JsonRepository } from '../persistence/jsonRepository';

interface LegacyWorkspace {
  environment?: EnvironmentType;
  environmentType?: EnvironmentType;
  partition?: string;
  partitionKey?: string;
}

const normalizeSnapshot = (snapshot: AppSnapshot): AppSnapshot => {
  const workspaces = snapshot.workspaces.map((workspace) => {
    const legacy = workspace as Workspace & LegacyWorkspace;
    const tabs = alignWorkspaceTabs(workspace, resolveWorkspaceActiveTabId(workspace));
    return {
      ...workspace,
      tabs,
      environmentType: legacy.environmentType ?? legacy.environment ?? 'dev',
      partitionKey: legacy.partitionKey ?? legacy.partition ?? buildWorkspacePartitionKey(workspace.id)
    };
  });

  const activeWorkspaceId =
    snapshot.activeWorkspaceId && workspaces.some((workspace) => workspace.id === snapshot.activeWorkspaceId)
      ? snapshot.activeWorkspaceId
      : workspaces[0]?.id;

  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId);
  const activeTabId = activeWorkspace
    ? resolveWorkspaceActiveTabId({ tabs: alignWorkspaceTabs(activeWorkspace, snapshot.activeTabId) })
    : undefined;

  return {
    ...snapshot,
    workspaces,
    activeWorkspaceId,
    activeTabId
  };
};

export class WorkspaceService {
  private snapshot: AppSnapshot = { version: 1, workspaces: [] };

  constructor(private readonly repository: JsonRepository<AppSnapshot>) {}

  async init(): Promise<void> {
    const loadedSnapshot = await this.repository.load();
    this.snapshot = normalizeSnapshot(loadedSnapshot);
    await this.repository.save(this.snapshot);
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
    const initialTabId = randomUUID();
    const workspace: Workspace = {
      id,
      name: input.name,
      environmentType: input.environmentType,
      customEnvironmentLabel: input.customEnvironmentLabel,
      prodDomains: input.prodDomains,
      partitionKey: buildWorkspacePartitionKey(id),
      tabs: [{ id: initialTabId, title: 'New Tab', url: 'https://example.com', isActive: true }],
      createdAt: now,
      updatedAt: now
    };

    this.snapshot.workspaces.push(workspace);
    this.snapshot.activeWorkspaceId = workspace.id;
    this.snapshot.activeTabId = initialTabId;
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
      const nextActiveWorkspace = this.snapshot.workspaces.find((item) => item.id === this.snapshot.activeWorkspaceId);
      this.snapshot.activeTabId = nextActiveWorkspace ? resolveWorkspaceActiveTabId(nextActiveWorkspace) : undefined;
    }

    await this.repository.save(this.snapshot);
    return true;
  }

  async persistTabs(workspaceId: string, tabs: Workspace['tabs']): Promise<void> {
    const workspace = this.snapshot.workspaces.find((item) => item.id === workspaceId);
    if (!workspace) return;

    workspace.tabs = alignWorkspaceTabs({ tabs }, resolveWorkspaceActiveTabId({ tabs }));
    workspace.updatedAt = new Date().toISOString();

    if (this.snapshot.activeWorkspaceId === workspaceId) {
      this.snapshot.activeTabId = resolveWorkspaceActiveTabId(workspace);
    }

    await this.repository.save(this.snapshot);
  }

  async switchWorkspace(workspaceId: string): Promise<AppSnapshot> {
    const workspace = this.snapshot.workspaces.find((item) => item.id === workspaceId);
    if (!workspace) return this.snapshot;

    this.snapshot.activeWorkspaceId = workspace.id;
    this.snapshot.activeTabId = resolveWorkspaceActiveTabId(workspace);
    await this.repository.save(this.snapshot);
    return this.snapshot;
  }

  async activateTab(workspaceId: string, tabId: string): Promise<AppSnapshot> {
    const workspace = this.snapshot.workspaces.find((item) => item.id === workspaceId);
    if (!workspace) return this.snapshot;

    workspace.tabs = alignWorkspaceTabs(workspace, tabId);
    workspace.updatedAt = new Date().toISOString();

    this.snapshot.activeWorkspaceId = workspaceId;
    this.snapshot.activeTabId = resolveWorkspaceActiveTabId(workspace);

    await this.repository.save(this.snapshot);
    return this.snapshot;
  }
}
