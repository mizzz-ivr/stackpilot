import { describe, expect, it } from 'vitest';
import { buildWorkspacePartitionKey, isWorkspacePartitionKey } from '../../shared/domain/partition';

describe('workspace partition', () => {
  it('workspace id から persist partition を生成する', () => {
    expect(buildWorkspacePartitionKey('abc')).toBe('persist:workspace-abc');
  });

  it('workspace partition 判定', () => {
    expect(isWorkspacePartitionKey('persist:workspace-abc')).toBe(true);
    expect(isWorkspacePartitionKey('persist:other')).toBe(false);
  });
});
