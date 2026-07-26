import type { ApiLogEntry, Workspace } from '../contracts';
import {
  createSafeApiLogExport,
  isApiLogExportRequest,
  isSensitiveExportHeaderName,
  maxApiLogExportEntries,
  sanitizeExportUrl,
  type ApiLogExportFilterKind,
  type ApiLogExportFormat,
  type ApiLogExportRequest,
  type SafeApiLogExportArtifact
} from './apiLogExport';
import {
  applyApiLogExportCustomMasking,
  createEmptyApiLogExportCustomMaskingReport,
  emptyApiLogExportCustomMaskingRules,
  isApiLogExportCustomMaskingRules,
  matchesApiLogExportCustomRule,
  normalizeApiLogExportCustomMaskingRules,
  type ApiLogExportCustomMaskingReport,
  type ApiLogExportCustomMaskingRules
} from './apiLogExportCustomMasking';
import { isSensitiveRequestBodyFieldName, type SafeRequestBodyPreview } from './requestBody';
import type { SafeResponseBodyPreview } from './responseBody';

export const apiLogExportPreviewTtlMs = 2 * 60 * 1000;
export const apiLogExportPreviewContentMaxChars = 12_000;
export const apiLogExportPreviewSampleLimit = 10;

export type ApiLogExportBodyState = 'included' | 'unavailable' | 'not-captured';

export interface ApiLogExportPreviewRequest extends ApiLogExportRequest {
  customMaskingRules?: ApiLogExportCustomMaskingRules;
}

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
  custom: ApiLogExportCustomMaskingReport;
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
  customMaskingRules: ApiLogExportCustomMaskingRules;
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
  customMaskingRules: ApiLogExportCustomMaskingRules;
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

export const isApiLogExportPreviewRequest = (value: unknown): value is ApiLogExportPreviewRequest => {
  if (!isApiLogExportRequest(value) || !isRecord(value)) return false;
  if (value.customMaskingRules === undefined) return true;
  if (!isRecord(value.customMaskingRules)) return false;
  const candidate = value.customMaskingRules;
  if (
    !Array.isArray(candidate.queryNames) ||
    !candidate.queryNames.every((item) => typeof item === 'string') ||
    !Array.isArray(candidate.headerNames) ||
    !candidate.headerNames.every((item) => typeof item === 'string') ||
    !Array.isArray(candidate.bodyFieldNames) ||
    !candidate.bodyFieldNames.every((item) => typeof item === 'string')
  ) {
    return false;
  }
  return isApiLogExportCustomMaskingRules(candidate);
};

export const isApiLogExportSaveRequest = (value: unknown): value is ApiLogExportSaveRequest =>
  isPreviewIdRequest(value);

export const isApiLogExportDiscardRequest = (value: unknown): value is ApiLogExportDiscardRequest =>
  isPreviewIdRequest(value);

export const createPreparedApiLogExportPreview = (input: {
  workspace: Pick<Workspace, 'id' | 'name' | 'environmentType' | 'customEnvironmentLabel'>;
  logs: ApiLogEntry[];
  format: ApiLogExportFormat;
  filterKind: ApiLogExportFilterKind;
  customMaskingRules?: ApiLogExportCustomMaskingRules;
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
  const customMaskingRules = normalizeApiLogExportCustomMaskingRules(input.customMaskingRules);

  const baseArtifact = createSafeApiLogExport({
    workspace: input.workspace,
    logs: input.logs,
    format: input.format,
    filterKind: input.filterKind,
    exportedAt,
    maxEntries: limit
  });
  const customMasking = applyApiLogExportCustomMasking(baseArtifact, customMaskingRules);
  const automaticReport = selectedLogs.reduce(addLogToMaskingReport, createEmptyMaskingReport());

  return {
    artifact: customMasking.artifact,
    exportedAt,
    customMaskingRules: customMasking.rules,
    maskingReport: {
      ...automaticReport,
      custom: customMasking.report
    },
    sampleEntries: selectedLogs
      .slice(0, apiLogExportPreviewSampleLimit)
      .map((log) => toPreviewEntry(log, customMaskingRules))
  };
};

export const createApiLogExportRequest = (
  workspaceId: string,
  format: ApiLogExportFormat,
  filterKind: ApiLogExportFilterKind,
  customMaskingRules: ApiLogExportCustomMaskingRules = emptyApiLogExportCustomMaskingRules()
): ApiLogExportPreviewRequest => ({ workspaceId, format, filterKind, customMaskingRules });

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

const toPreviewEntry = (
  log: ApiLogEntry,
  customMaskingRules: ApiLogExportCustomMaskingRules
): ApiLogExportPreviewEntry => ({
  id: log.id,
  resourceType: log.type,
  method: log.method.toUpperCase(),
  url: sanitizePreviewUrl(log.url, customMaskingRules.queryNames),
  status: log.status,
  requestHeaderValuesRedacted: analyzeHeaders(log.requestHeaders).valuesRedacted,
  responseHeaderValuesRedacted: analyzeHeaders(log.responseHeaders).valuesRedacted,
  requestBodyState: toRequestBodyState(log.requestBody),
  responseBodyState: toResponseBodyState(log.responseBody),
  requestBodyFieldsRedacted: log.requestBody?.redactedFieldPaths.length ?? 0,
  responseBodyFieldsRedacted: log.responseBody?.redactedFieldPaths.length ?? 0
});

const sanitizePreviewUrl = (value: string, customQueryRules: string[]): string => {
  const sanitized = sanitizeExportUrl(value);
  if (customQueryRules.length === 0 || sanitized === '<redacted-invalid-url>') return sanitized;
  try {
    const url = new URL(sanitized);
    const entries = [...url.searchParams.entries()];
    url.search = '';
    entries.forEach(([name, itemValue]) => {
      url.searchParams.append(
        name,
        matchesApiLogExportCustomRule(name, customQueryRules) ? '<redacted>' : itemValue
      );
    });
    return url.toString();
  } catch {
    return sanitized;
  }
};

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
  networkErrorStringsExcluded: 0,
  custom: createEmptyApiLogExportCustomMaskingReport()
});

const matchesFilter = (log: ApiLogEntry, filterKind: ApiLogExportFilterKind): boolean =>
  filterKind === 'all' || log.type === filterKind;

const isPreviewIdRequest = (value: unknown): value is { previewId: string } =>
  isRecord(value) && typeof value.previewId === 'string' && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value.previewId);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
