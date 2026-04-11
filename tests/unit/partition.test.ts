import { describe, expect, it } from 'vitest';
import { buildWorkspacePartition, isWorkspacePartition } from '../../electron/main/domain/partition';

describe('workspace partition', () => {
  it('workspace id から persist partition を生成する', () => {
    expect(buildWorkspacePartition('abc')).toBe('persist:workspace-abc');
  });

  it('workspace partition 判定', () => {
    expect(isWorkspacePartition('persist:workspace-abc')).toBe(true);
    expect(isWorkspacePartition('persist:other')).toBe(false);
  });
});
