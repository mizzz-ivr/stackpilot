import { randomUUID } from 'node:crypto';
import type { AppSnapshot, CreateWorkspaceInput, Workspace } from '../../../shared/contracts';
import type { EnvironmentType } from '../../../shared/domain/environment';
import { buildWorkspacePartition } from '../../../shared/domain/partition';
import { createSessionSnapshot, restoreSessionSnapshot, type SessionSnapshot } from '../../../shared/domain/sessionRestore';
import { JsonRepository } from '../persistence/jsonRepository';

interface LegacyWorkspace {
  environment?: EnvironmentType;
  environmentType?: EnvironmentType;
  partition?: string;
  partitionKey?: string;
}

export class WorkspaceService {
  private snapshot: AppSnapshot = { version: 2, workspaces: [] };

  constructor(private readonly repository: JsonRepository<SessionSnapshot>) {}

  async init(): Promise<void> {
    const loadedSnapshot = await this.repository.load();
    const restored = restoreSessionSnapshot(loadedSnapshot);
    this.snapshot = restored.snapshot;
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
      partitionKey: buildWorkspacePartition(id),
      tabs: [{ id: randomUUID(), title: 'New Tab', url: 'https://example.com', isActive: true, workspaceId: id }],
      createdAt: now,
      updatedAt: now
    };

    this.snapshot.workspaces.push(workspace);
    this.snapshot.activeWorkspaceId = workspace.id;
    this.snapshot.activeTabId = workspace.tabs[0]?.id;
    await this.persist();
    return workspace;
  }

  async update(workspaceId: string, patch: Partial<Workspace>): Promise<Workspace | null> {
    const workspace = this.snapshot.workspaces.find((item) => item.id === workspaceId);
    if (!workspace) return null;

    const legacy = patch as Partial<Workspace & LegacyWorkspace>;
    Object.assign(workspace, {
      ...patch,
      environmentType: legacy.environmentType ?? legacy.environment ?? workspace.environmentType,
      partitionKey: legacy.partitionKey ?? legacy.partition ?? workspace.partitionKey,
      updatedAt: new Date().toISOString()
    });
    await this.persist();
    return workspace;
  }

  async remove(workspaceId: string): Promise<boolean> {
    const before = this.snapshot.workspaces.length;
    this.snapshot.workspaces = this.snapshot.workspaces.filter((item) => item.id !== workspaceId);
    if (before === this.snapshot.workspaces.length) return false;

    if (this.snapshot.activeWorkspaceId === workspaceId) {
      this.snapshot.activeWorkspaceId = this.snapshot.workspaces[0]?.id;
      this.snapshot.activeTabId = this.snapshot.workspaces[0]?.tabs.find((tab) => tab.isActive)?.id ?? this.snapshot.workspaces[0]?.tabs[0]?.id;
    }

    await this.persist();
    return true;
  }

  async persistTabs(workspaceId: string, tabs: Workspace['tabs']): Promise<void> {
    const workspace = this.snapshot.workspaces.find((item) => item.id === workspaceId);
    if (!workspace) return;

    workspace.tabs = tabs.map((tab) => ({ ...tab, workspaceId }));
    workspace.updatedAt = new Date().toISOString();
    this.snapshot.activeWorkspaceId = workspaceId;
    this.snapshot.activeTabId = workspace.tabs.find((tab) => tab.isActive)?.id ?? workspace.tabs[0]?.id;
    await this.persist();
  }

  async setActiveContext(workspaceId?: string, tabId?: string): Promise<void> {
    const workspace = workspaceId ? this.snapshot.workspaces.find((item) => item.id === workspaceId) : undefined;
    this.snapshot.activeWorkspaceId = workspace?.id ?? this.snapshot.workspaces[0]?.id;
    const activeWorkspace = this.snapshot.workspaces.find((item) => item.id === this.snapshot.activeWorkspaceId);

    const activeTab = tabId ? activeWorkspace?.tabs.find((tab) => tab.id === tabId) : undefined;
    this.snapshot.activeTabId = activeTab?.id ?? activeWorkspace?.tabs.find((tab) => tab.isActive)?.id ?? activeWorkspace?.tabs[0]?.id;
    await this.persist();
  }

  async persist(): Promise<void> {
    const sessionSnapshot = createSessionSnapshot(this.snapshot);
    await this.repository.save(sessionSnapshot);
  }
}
