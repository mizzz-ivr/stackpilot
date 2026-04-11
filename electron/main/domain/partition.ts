const PARTITION_PREFIX = 'persist:workspace-';

export const buildWorkspacePartition = (workspaceId: string): string => `${PARTITION_PREFIX}${workspaceId}`;

export const isWorkspacePartition = (partition: string): boolean => partition.startsWith(PARTITION_PREFIX);
