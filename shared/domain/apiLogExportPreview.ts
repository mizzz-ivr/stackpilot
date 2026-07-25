import type { ApiLogEntry, Workspace } from '../contracts';
import {
  createSafeApiLogExport,
  isSensitiveExportHeaderName,
  maxApiLogExportEntries,
  sanitizeExportUrl,
  type ApiLogExportFilterKind,
  type ApiLogExportFormat,
  type ApiLogExportRequest,
  type SafeApiLogExportArtifact
} from './apiLogExport';
import { isSensitiveRequestBodyFieldName, type SafeRequestBodyPreview } from './requestBody';
import type { SafeResponseBodyPreview } from './responseBody';

export const apiLogExportPreviewTtlMs = 2 * 60 * 1000;
export const apiLogExportPreviewContentMaxChars = 12_000;
export const apiLogExportPreviewSampleLimit = 10;

export type ApiLogExportBodyState = 'included' | 'unavailable' | 'not-captured';

export interface ApiLogExportMaskingReport {
  urlUserInfoRemoved: number;
  invalidUrlsRedacted: number;
  urlFragmentsRedacted: number;
  sensitiveQueryValuesRedacted: number;
  requestHeaderValuesRedacted: number;
  responseHeaderValuesRedacted: number;
  requestUrlHeaderValuesSanitized: number;
  responseUrlHeaderValuesSanitized: number;
  requestBodyFieldsRedacted: number;
  responseBodyFieldsRedacted: number;
  requestBodiesUnavailable: number;
  responseBodiesUnavailable: number;
  networkErrorStringsExcluded: number;
}

export interface ApiLogExportPreviewEntry {
  id: string;
  resourceType: ApiLogEntry['type'];
  method: string;
  url: string;
  status?: number;
  requestHeaderValuesRedacted: number;
  responseHeaderValuesRedacted: number;
  requestBodyState: ApiLogExportBodyState;
  responseBodyState: ApiLogExportBodyState;
  requestBodyFieldsRedacted: number;
  responseBodyFieldsRedacted: number;
}

export interface PreparedApiLogExportPreview {
  artifact: SafeApiLogExportArtifact;
  exportedAt: number;
  maskingReport: ApiLogExportMaskingReport;
  sampleEntries: ApiLogExportPreviewEntry[];
}

export interface ApiLogExportPreview {
  previewId: string;
  format: ApiLogExportFormat;
  filterKind: ApiLogExportFilterKind;
  workspace: Pick<Workspace, 'id' | 'name' | 'environmentType' | 'customEnvironmentLabel'>;
  exportedAt: number;
  expiresAt: number;
  exportedCount: number;
  omittedCount: number;
  contentByteLength: number;
  artifactSha256: string;
  contentPreview: string;
  isContentPreviewTruncated: boolean;
  maskingReport: ApiLogExportMaskingReport;
  sampleEntries: ApiLogExportPreviewEntry[];
}

export type ApiLogExportPreviewResult =
  | { status: 'ready'; preview: ApiLogExportPreview }
  | {
      status: 'failed';
      errorCode: 'invalid-request' | 'workspace-not-found' | 'generation-failed';
      errorMessage: string;
    };

export interface ApiLogExportSaveRequest {
  previewId: string;
}

export interface ApiLogExportDiscardRequest {
  previewId: string;
}

export type ApiLogExportSaveResult =
  | {
      status: 'saved';
      filePath: string;
      exportedCount: number;
      omittedCount: number;
      artifactSha256: string;
    }
  | {
      status: 'cancelled';
      exportedCount: 0;
      omittedCount: 0;
    }
  | {
      status: 'failed';
      exportedCount: 0;
      omittedCount: 0;
      errorCode:
        | 'invalid-request'
        | 'preview-not-found'
        | 'preview-expired'
        | 'dialog-unavailable'
        | 'write-failed';
      errorMessage: string;
    };

const urlHeaderNames = new Set(['location', 'content-location', 'referer', 'referrer']);
const sensitiveQueryNames = new Set(['signature', 'sig', 'credential', 'jwt', 'authcode', 'authorizationcode']);

export const isApiLogExportSaveRequest = (value: unknown): value is ApiLogExportSaveRequest =>
  isPreviewIdRequest(value);

export const isApiLogExportDiscardRequest = (value: unknown): value is ApiLogExportDiscardRequest =>
  isPreviewIdRequest(value);

export const createPreparedApiLogExportPreview = (input: {
  workspace: Pick<Workspace, 'id' | 'name' | 'environmentType' | 'customEnvironmentLabel'>;
  logs: ApiLogEntry[];
  format: ApiLogExportFormat;
  filterKind: ApiLogExportFilterKind;
  exportedAt?: number;
  maxEntries?: number;
}): PreparedApiLogExportPreview => {
  const exportedAt = input.exportedAt ?? Date.now();
  const limit = Math.min(
    maxApiLogExportEntries,
    Math.max(1, Math.floor(input.maxEntries ?? maxApiLogExportEntries))
  );
  const selectedLogs = input.logs
    .filter((log) => log.workspaceId === input.workspace.id && matchesFilter(log, input.filterKind))
    .slice(0, limit);

  const artifact = createSafeApiLogExport({
    ...input,
    exportedAt,
    maxEntries: limit
  });

  return {
    artifact,
    exportedAt,
    maskingReport: selectedLogs.reduce(addLogToMaskingReport, createEmptyMaskingReport()),
    sampleEntries: selectedLogs.slice(0, apiLogExportPreviewSampleLimit).map(toPreviewEntry)
  };
};

export const createApiLogExportRequest = (
  workspaceId: string,
  format: ApiLogExportFormat,
  filterKind: ApiLogExportFilterKind
): ApiLogExportRequest => ({ workspaceId, format, filterKind });

const addLogToMaskingReport = (
  report: ApiLogExportMaskingReport,
  log: ApiLogEntry
): ApiLogExportMaskingReport => {
  const urlReport = analyzeUrl(log.url);
  const requestHeaderReport = analyzeHeaders(log.requestHeaders);
  const responseHeaderReport = analyzeHeaders(log.responseHeaders);

  report.urlUserInfoRemoved += urlReport.userInfoRemoved;
  report.invalidUrlsRedacted += urlReport.invalidUrlRedacted;
  report.urlFragmentsRedacted += urlReport.fragmentRedacted;
  report.sensitiveQueryValuesRedacted += urlReport.sensitiveQueryValuesRedacted;
  report.requestHeaderValuesRedacted += requestHeaderReport.valuesRedacted;
  report.responseHeaderValuesRedacted += responseHeaderReport.valuesRedacted;
  report.requestUrlHeaderValuesSanitized += requestHeaderReport.urlValuesSanitized;
  report.responseUrlHeaderValuesSanitized += responseHeaderReport.urlValuesSanitized;
  report.requestBodyFieldsRedacted += log.requestBody?.redactedFieldPaths.length ?? 0;
  report.responseBodyFieldsRedacted += log.responseBody?.redactedFieldPaths.length ?? 0;
  report.requestBodiesUnavailable += log.requestBody?.kind === 'unavailable' ? 1 : 0;
  report.responseBodiesUnavailable += log.responseBody?.kind === 'unavailable' ? 1 : 0;
  report.networkErrorStringsExcluded += log.status === undefined && Boolean(log.responseBodySnippet) ? 1 : 0;
  return report;
};

const toPreviewEntry = (log: ApiLogEntry): ApiLogExportPreviewEntry => ({
  id: log.id,
  resourceType: log.type,
  method: log.method.toUpperCase(),
  url: sanitizeExportUrl(log.url),
  status: log.status,
  requestHeaderValuesRedacted: analyzeHeaders(log.requestHeaders).valuesRedacted,
  responseHeaderValuesRedacted: analyzeHeaders(log.responseHeaders).valuesRedacted,
  requestBodyState: toRequestBodyState(log.requestBody),
  responseBodyState: toResponseBodyState(log.responseBody),
  requestBodyFieldsRedacted: log.requestBody?.redactedFieldPaths.length ?? 0,
  responseBodyFieldsRedacted: log.responseBody?.redactedFieldPaths.length ?? 0
});

const toRequestBodyState = (body?: SafeRequestBodyPreview): ApiLogExportBodyState => {
  if (!body) return 'not-captured';
  return body.kind === 'unavailable' ? 'unavailable' : 'included';
};

const toResponseBodyState = (body?: SafeResponseBodyPreview): ApiLogExportBodyState => {
  if (!body) return 'not-captured';
  return body.kind === 'unavailable' ? 'unavailable' : 'included';
};

const analyzeHeaders = (headers: Record<string, string>): { valuesRedacted: number; urlValuesSanitized: number } =>
  Object.entries(headers).reduce(
    (summary, [name, value]) => {
      const normalizedName = name.trim().toLowerCase();
      if (isSensitiveExportHeaderName(name) || normalizedName === 'refresh') {
        summary.valuesRedacted += 1;
        return summary;
      }
      if (urlHeaderNames.has(normalizedName) && analyzeUrl(value).hasSanitization) {
        summary.urlValuesSanitized += 1;
      }
      return summary;
    },
    { valuesRedacted: 0, urlValuesSanitized: 0 }
  );

const analyzeUrl = (value: string): {
  userInfoRemoved: number;
  invalidUrlRedacted: number;
  fragmentRedacted: number;
  sensitiveQueryValuesRedacted: number;
  hasSanitization: boolean;
} => {
  try {
    const url = new URL(value);
    const userInfoRemoved = url.username || url.password ? 1 : 0;
    const fragmentRedacted = url.hash ? 1 : 0;
    const sensitiveQueryValuesRedacted = [...url.searchParams.entries()].filter(([name]) =>
      isSensitiveExportFieldName(name)
    ).length;
    return {
      userInfoRemoved,
      invalidUrlRedacted: 0,
      fragmentRedacted,
      sensitiveQueryValuesRedacted,
      hasSanitization: userInfoRemoved > 0 || fragmentRedacted > 0 || sensitiveQueryValuesRedacted > 0
    };
  } catch {
    return {
      userInfoRemoved: 0,
      invalidUrlRedacted: 1,
      fragmentRedacted: 0,
      sensitiveQueryValuesRedacted: 0,
      hasSanitization: true
    };
  }
};

const isSensitiveExportFieldName = (name: string): boolean => {
  const compact = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return isSensitiveRequestBodyFieldName(name) || sensitiveQueryNames.has(compact);
};

const createEmptyMaskingReport = (): ApiLogExportMaskingReport => ({
  urlUserInfoRemoved: 0,
  invalidUrlsRedacted: 0,
  urlFragmentsRedacted: 0,
  sensitiveQueryValuesRedacted: 0,
  requestHeaderValuesRedacted: 0,
  responseHeaderValuesRedacted: 0,
  requestUrlHeaderValuesSanitized: 0,
  responseUrlHeaderValuesSanitized: 0,
  requestBodyFieldsRedacted: 0,
  responseBodyFieldsRedacted: 0,
  requestBodiesUnavailable: 0,
  responseBodiesUnavailable: 0,
  networkErrorStringsExcluded: 0
});

const matchesFilter = (log: ApiLogEntry, filterKind: ApiLogExportFilterKind): boolean =>
  filterKind === 'all' || log.type === filterKind;

const isPreviewIdRequest = (value: unknown): value is { previewId: string } =>
  isRecord(value) && typeof value.previewId === 'string' && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value.previewId);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
