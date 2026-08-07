import type { ApiLogEntry, Workspace } from '../contracts';
import {
  compareNetworkLogs,
  createApiLogComparisonView,
  type ApiLogComparisonView
} from './apiLogComparison';
import { sanitizeExportHeaders, sanitizeExportUrl } from './apiLogExport';
import { toNetworkLog, type NetworkLog } from './inspector';
import type { SafeRequestBodyPreview } from './requestBody';
import type { SafeResponseBodyPreview } from './responseBody';

export const apiLogComparisonExportSchema = 'stackpilot-safe-api-log-comparison';
export const apiLogComparisonExportVersion = 1;

export interface ApiLogComparisonExportRequest {
  workspaceId: string;
  leftLogId: string;
  rightLogId: string;
  differencesOnly: boolean;
}

export type ApiLogComparisonExportErrorCode =
  | 'invalid-request'
  | 'workspace-not-found'
  | 'logs-not-found'
  | 'generation-failed'
  | 'dialog-unavailable'
  | 'write-failed';

export type ApiLogComparisonExportResult =
  | {
      status: 'saved';
      filePath: string;
      artifactSha256: string;
      differenceCount: number;
      exportedItemCount: number;
    }
  | {
      status: 'cancelled';
      differenceCount: number;
      exportedItemCount: number;
    }
  | {
      status: 'failed';
      errorCode: ApiLogComparisonExportErrorCode;
      errorMessage: string;
      differenceCount: 0;
      exportedItemCount: 0;
    };

export interface SafeApiLogComparisonArtifact {
  content: string;
  differenceCount: number;
  exportedItemCount: number;
}

export interface CreateSafeApiLogComparisonArtifactInput {
  workspace: Pick<Workspace, 'id' | 'name' | 'environmentType' | 'customEnvironmentLabel'>;
  left: ApiLogEntry;
  right: ApiLogEntry;
  differencesOnly: boolean;
  exportedAt?: number;
}

export const isApiLogComparisonExportRequest = (
  value: unknown
): value is ApiLogComparisonExportRequest => {
  if (!isRecord(value)) return false;
  return (
    typeof value.workspaceId === 'string' &&
    value.workspaceId.length > 0 &&
    typeof value.leftLogId === 'string' &&
    value.leftLogId.length > 0 &&
    typeof value.rightLogId === 'string' &&
    value.rightLogId.length > 0 &&
    value.leftLogId !== value.rightLogId &&
    typeof value.differencesOnly === 'boolean'
  );
};

export const createSafeApiLogComparisonArtifact = (
  input: CreateSafeApiLogComparisonArtifactInput
): SafeApiLogComparisonArtifact => {
  if (
    input.left.workspaceId !== input.workspace.id ||
    input.right.workspaceId !== input.workspace.id ||
    input.left.id === input.right.id
  ) {
    throw new Error('comparison-target-mismatch');
  }

  const left = toSafeComparisonLog(input.left);
  const right = toSafeComparisonLog(input.right);
  const comparison = compareNetworkLogs(left, right);
  const view = createApiLogComparisonView(comparison, input.differencesOnly);
  const exportedAt = new Date(input.exportedAt ?? Date.now()).toISOString();

  return {
    content: `${JSON.stringify(
      {
        schema: apiLogComparisonExportSchema,
        version: apiLogComparisonExportVersion,
        exportedAt,
        workspace: {
          id: input.workspace.id,
          name: input.workspace.name,
          environmentType: input.workspace.environmentType,
          customEnvironmentLabel: input.workspace.customEnvironmentLabel
        },
        options: { differencesOnly: input.differencesOnly },
        security: {
          sanitized: true,
          rawBodiesIncluded: false,
          networkErrorDetailsIncluded: false,
          urlUserInfoRemoved: true,
          urlFragmentsRedacted: true,
          sensitiveQueryValuesRedacted: true,
          sensitiveHeaderValuesRedacted: true
        },
        targets: {
          left: toTargetMetadata(left),
          right: toTargetMetadata(right)
        },
        counts: view.counts,
        comparison: toExportedComparison(view)
      },
      null,
      2
    )}\n`,
    differenceCount: view.counts.different,
    exportedItemCount: view.counts.visible
  };
};

const toSafeComparisonLog = (entry: ApiLogEntry): NetworkLog =>
  toNetworkLog({
    ...entry,
    method: entry.method.toUpperCase(),
    url: sanitizeExportUrl(entry.url),
    requestHeaders: sanitizeExportHeaders(entry.requestHeaders),
    requestBody: cloneRequestBody(entry.requestBody),
    responseHeaders: sanitizeExportHeaders(entry.responseHeaders),
    responseBody: cloneResponseBody(entry.responseBody),
    responseBodySnippet: undefined
  });

const toTargetMetadata = (log: NetworkLog) => ({
  id: log.id,
  resourceType: log.resourceType,
  method: log.method,
  url: log.url,
  status: log.status,
  durationMs: log.durationMs,
  startedAt: log.startedAt,
  finishedAt: log.finishedAt,
  updatedAt: log.updatedAt,
  networkError: log.status === undefined ? 'request-failed' : undefined
});

const toExportedComparison = (view: ApiLogComparisonView) => ({
  summary: view.summary,
  requestHeaders: view.requestHeaders,
  requestBody: view.requestBody,
  responseHeaders: view.responseHeaders,
  responseBody: view.responseBody,
  hasDifferences: view.hasDifferences
});

const cloneRequestBody = (
  body?: SafeRequestBodyPreview
): SafeRequestBodyPreview | undefined => {
  if (!body) return undefined;
  return {
    kind: body.kind,
    contentType: body.contentType,
    content: body.kind === 'unavailable' ? undefined : body.content,
    byteLength: body.byteLength,
    isTruncated: body.isTruncated,
    redactedFieldPaths: [...body.redactedFieldPaths],
    unavailableReason: body.unavailableReason
  };
};

const cloneResponseBody = (
  body?: SafeResponseBodyPreview
): SafeResponseBodyPreview | undefined => {
  if (!body) return undefined;
  return {
    kind: body.kind,
    contentType: body.contentType,
    content: body.kind === 'unavailable' ? undefined : body.content,
    byteLength: body.byteLength,
    isTruncated: body.isTruncated,
    redactedFieldPaths: [...body.redactedFieldPaths],
    unavailableReason: body.unavailableReason
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
