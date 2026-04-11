const PARTITION_PREFIX = 'persist:workspace-';

export const buildWorkspacePartitionKey = (workspaceId: string): string => `${PARTITION_PREFIX}${workspaceId}`;

export const isWorkspacePartitionKey = (partitionKey: string): boolean => partitionKey.startsWith(PARTITION_PREFIX);
