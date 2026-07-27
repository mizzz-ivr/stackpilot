import type { SafeApiLogExportArtifact } from './apiLogExport';
import { normalizeRequestBodyContentType } from './requestBody';

export const maxApiLogExportCustomRulesPerCategory = 20;
export const maxApiLogExportCustomRuleLength = 64;
export const maxApiLogExportPathSegmentLength = 256;
export const apiLogExportRedactedPathSegment = '<redacted-path>';

export interface ApiLogExportCustomMaskingRules {
  pathSegmentValues: string[];
  queryNames: string[];
  headerNames: string[];
  bodyFieldNames: string[];
}

export interface ApiLogExportCustomMaskingReport {
  pathSegmentsRedacted: number;
  queryValuesRedacted: number;
  requestHeaderValuesRedacted: number;
  responseHeaderValuesRedacted: number;
  requestBodyFieldsRedacted: number;
  responseBodyFieldsRedacted: number;
}

export type ApiLogExportCustomRuleParseResult =
  | { status: 'valid'; rules: ApiLogExportCustomMaskingRules }
  | { status: 'invalid'; errorMessage: string };

export interface ApiLogExportUrlMaskingResult {
  value: string;
  pathSegmentsRedacted: number;
  queryValuesRedacted: number;
}

type MaskingSide = 'request' | 'response';
type MaskingSummary = { redactedCount: number; redactedPaths: string[] };

const redactedValue = '<redacted>';
const urlHeaderNames = new Set(['location', 'content-location', 'referer', 'referrer']);

export const emptyApiLogExportCustomMaskingRules = (): ApiLogExportCustomMaskingRules => ({
  pathSegmentValues: [],
  queryNames: [],
  headerNames: [],
  bodyFieldNames: []
});

export const createEmptyApiLogExportCustomMaskingReport = (): ApiLogExportCustomMaskingReport => ({
  pathSegmentsRedacted: 0,
  queryValuesRedacted: 0,
  requestHeaderValuesRedacted: 0,
  responseHeaderValuesRedacted: 0,
  requestBodyFieldsRedacted: 0,
  responseBodyFieldsRedacted: 0
});

export const normalizeApiLogExportCustomRuleName = (value: string): string =>
  value.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/[\s_-]+/g, '');

export const normalizeApiLogExportPathSegmentValue = (value: string): string =>
  value.normalize('NFKC').trim();

export const isApiLogExportCustomMaskingRules = (value: unknown): value is ApiLogExportCustomMaskingRules => {
  if (!isRecord(value)) return false;
  if (
    !isRuleList(value.pathSegmentValues) ||
    !isRuleList(value.queryNames) ||
    !isRuleList(value.headerNames) ||
    !isRuleList(value.bodyFieldNames)
  ) {
    return false;
  }

  const rules: ApiLogExportCustomMaskingRules = {
    pathSegmentValues: value.pathSegmentValues,
    queryNames: value.queryNames,
    headerNames: value.headerNames,
    bodyFieldNames: value.bodyFieldNames
  };
  return !findInvalidFieldCategory(rules) && !findInvalidPathSegmentCategory(rules.pathSegmentValues);
};

export const normalizeApiLogExportCustomMaskingRules = (
  rules?: ApiLogExportCustomMaskingRules
): ApiLogExportCustomMaskingRules => ({
  pathSegmentValues: normalizePathSegmentList(rules?.pathSegmentValues ?? []),
  queryNames: normalizeRuleList(rules?.queryNames ?? []),
  headerNames: normalizeRuleList(rules?.headerNames ?? []),
  bodyFieldNames: normalizeRuleList(rules?.bodyFieldNames ?? [])
});

export const hasApiLogExportCustomMaskingRules = (rules?: ApiLogExportCustomMaskingRules): boolean => {
  const normalized = normalizeApiLogExportCustomMaskingRules(rules);
  return (
    normalized.pathSegmentValues.length +
      normalized.queryNames.length +
      normalized.headerNames.length +
      normalized.bodyFieldNames.length >
    0
  );
};

export const parseApiLogExportCustomMaskingRuleText = (input: {
  pathSegmentValuesText: string;
  queryNamesText: string;
  headerNamesText: string;
  bodyFieldNamesText: string;
}): ApiLogExportCustomRuleParseResult => {
  const rules: ApiLogExportCustomMaskingRules = {
    pathSegmentValues: splitRuleText(input.pathSegmentValuesText),
    queryNames: splitRuleText(input.queryNamesText),
    headerNames: splitRuleText(input.headerNamesText),
    bodyFieldNames: splitRuleText(input.bodyFieldNamesText)
  };
  const errorMessage = findInvalidPathSegmentCategory(rules.pathSegmentValues) ?? findInvalidFieldCategory(rules);
  return errorMessage
    ? { status: 'invalid', errorMessage }
    : { status: 'valid', rules: normalizeApiLogExportCustomMaskingRules(rules) };
};

export const matchesApiLogExportCustomRule = (name: string, rules: string[]): boolean => {
  const normalized = normalizeApiLogExportCustomRuleName(name);
  return normalized.length > 0 && rules.some((rule) => normalizeApiLogExportCustomRuleName(rule) === normalized);
};

export const matchesApiLogExportPathSegment = (value: string, rules: string[]): boolean => {
  const normalized = normalizeApiLogExportPathSegmentValue(value);
  return normalized.length > 0 && rules.some((rule) => normalizeApiLogExportPathSegmentValue(rule) === normalized);
};

export const extractApiLogExportSelectablePathSegments = (value: string): string[] => {
  try {
    const url = new URL(value);
    const seen = new Set<string>();
    const segments: string[] = [];
    for (const encodedSegment of url.pathname.split('/')) {
      if (!encodedSegment) continue;
      const decoded = safeDecodePathSegment(encodedSegment);
      if (!decoded) continue;
      const normalized = normalizeApiLogExportPathSegmentValue(decoded);
      if (!normalized || normalized === '.' || normalized === '..' || normalized === apiLogExportRedactedPathSegment) {
        continue;
      }
      if (!seen.has(normalized)) {
        seen.add(normalized);
        segments.push(normalized);
      }
    }
    return segments;
  } catch {
    return [];
  }
};

export const applyApiLogExportCustomMaskingToUrl = (
  value: string,
  inputRules?: ApiLogExportCustomMaskingRules
): ApiLogExportUrlMaskingResult => {
  const rules = normalizeApiLogExportCustomMaskingRules(inputRules);
  if (rules.pathSegmentValues.length === 0 && rules.queryNames.length === 0) {
    return { value, pathSegmentsRedacted: 0, queryValuesRedacted: 0 };
  }

  try {
    const url = new URL(value);
    let pathSegmentsRedacted = 0;
    let queryValuesRedacted = 0;

    if (rules.pathSegmentValues.length > 0) {
      const nextSegments = url.pathname.split('/').map((encodedSegment) => {
        if (!encodedSegment) return encodedSegment;
        const decoded = safeDecodePathSegment(encodedSegment);
        if (
          !decoded ||
          decoded === apiLogExportRedactedPathSegment ||
          !matchesApiLogExportPathSegment(decoded, rules.pathSegmentValues)
        ) {
          return encodedSegment;
        }
        pathSegmentsRedacted += 1;
        return apiLogExportRedactedPathSegment;
      });
      url.pathname = nextSegments.join('/');
    }

    if (rules.queryNames.length > 0) {
      const entries = [...url.searchParams.entries()];
      url.search = '';
      entries.forEach(([name, itemValue]) => {
        const shouldMask = matchesApiLogExportCustomRule(name, rules.queryNames) && itemValue !== redactedValue;
        url.searchParams.append(name, shouldMask ? redactedValue : itemValue);
        if (shouldMask) queryValuesRedacted += 1;
      });
    }

    return { value: url.toString(), pathSegmentsRedacted, queryValuesRedacted };
  } catch {
    return { value, pathSegmentsRedacted: 0, queryValuesRedacted: 0 };
  }
};

export const applyApiLogExportCustomMasking = (
  artifact: SafeApiLogExportArtifact,
  inputRules?: ApiLogExportCustomMaskingRules
): {
  artifact: SafeApiLogExportArtifact;
  report: ApiLogExportCustomMaskingReport;
  rules: ApiLogExportCustomMaskingRules;
} => {
  const rules = normalizeApiLogExportCustomMaskingRules(inputRules);
  const report = createEmptyApiLogExportCustomMaskingReport();
  if (!hasApiLogExportCustomMaskingRules(rules)) return { artifact, report, rules };

  const payload: unknown = JSON.parse(artifact.content);
  if (!isRecord(payload)) throw new Error('エクスポート成果物の形式が不正です。');

  if (artifact.extension === 'json') applyToSafeJsonPayload(payload, rules, report);
  else applyToHarPayload(payload, rules, report);

  return {
    artifact: { ...artifact, content: `${JSON.stringify(payload, null, 2)}\n` },
    report,
    rules
  };
};

const applyToSafeJsonPayload = (
  payload: Record<string, unknown>,
  rules: ApiLogExportCustomMaskingRules,
  report: ApiLogExportCustomMaskingReport
): void => {
  const logs = Array.isArray(payload.logs) ? payload.logs : [];
  logs.forEach((value) => {
    if (!isRecord(value)) return;
    maskUrlProperty(value, 'url', rules, report);
    maskHeaderRecord(value.requestHeaders, rules, report, 'request');
    maskHeaderRecord(value.responseHeaders, rules, report, 'response');
    maskBodyRecord(value.requestBody, rules.bodyFieldNames, report, 'request');
    maskBodyRecord(value.responseBody, rules.bodyFieldNames, report, 'response');
  });

  if (isRecord(payload.security)) {
    payload.security.customMaskingApplied = true;
    payload.security.customMaskingRuleCounts = toRuleCounts(rules);
  }
};

const applyToHarPayload = (
  payload: Record<string, unknown>,
  rules: ApiLogExportCustomMaskingRules,
  report: ApiLogExportCustomMaskingReport
): void => {
  const log = isRecord(payload.log) ? payload.log : undefined;
  const entries = log && Array.isArray(log.entries) ? log.entries : [];

  entries.forEach((value) => {
    if (!isRecord(value)) return;
    const request = isRecord(value.request) ? value.request : undefined;
    const response = isRecord(value.response) ? value.response : undefined;

    if (request) {
      maskUrlProperty(request, 'url', rules, report);
      maskHarQueryString(request.queryString, rules.queryNames);
      maskHeaderArray(request.headers, rules, report, 'request');
      if (isRecord(request.postData)) {
        maskTextBody(
          request.postData,
          'text',
          typeof request.postData.mimeType === 'string' ? request.postData.mimeType : undefined,
          rules.bodyFieldNames,
          report,
          'request'
        );
      }
    }

    if (response) {
      maskHeaderArray(response.headers, rules, report, 'response');
      maskUrlProperty(response, 'redirectURL', rules, report);
      if (isRecord(response.content)) {
        maskTextBody(
          response.content,
          'text',
          typeof response.content.mimeType === 'string' ? response.content.mimeType : undefined,
          rules.bodyFieldNames,
          report,
          'response'
        );
      }
    }
  });

  if (log) {
    if (!isRecord(log._stackpilot)) log._stackpilot = {};
    const metadata = log._stackpilot as Record<string, unknown>;
    metadata.customMaskingApplied = true;
    metadata.customMaskingRuleCounts = toRuleCounts(rules);
  }
};

const maskUrlProperty = (
  record: Record<string, unknown>,
  property: string,
  rules: ApiLogExportCustomMaskingRules,
  report: ApiLogExportCustomMaskingReport
): void => {
  const value = record[property];
  if (typeof value !== 'string') return;
  const result = applyApiLogExportCustomMaskingToUrl(value, rules);
  record[property] = result.value;
  report.pathSegmentsRedacted += result.pathSegmentsRedacted;
  report.queryValuesRedacted += result.queryValuesRedacted;
};

const maskHarQueryString = (value: unknown, queryRules: string[]): void => {
  if (!Array.isArray(value)) return;
  value.forEach((entry) => {
    if (!isRecord(entry) || typeof entry.name !== 'string' || typeof entry.value !== 'string') return;
    if (matchesApiLogExportCustomRule(entry.name, queryRules)) entry.value = redactedValue;
  });
};

const maskHeaderRecord = (
  value: unknown,
  rules: ApiLogExportCustomMaskingRules,
  report: ApiLogExportCustomMaskingReport,
  side: MaskingSide
): void => {
  if (!isRecord(value)) return;
  Object.entries(value).forEach(([name, headerValue]) => {
    if (typeof headerValue !== 'string') return;
    if (matchesApiLogExportCustomRule(name, rules.headerNames) && headerValue !== redactedValue) {
      value[name] = redactedValue;
      incrementHeaderReport(report, side);
    } else if (urlHeaderNames.has(name.trim().toLowerCase())) {
      const masked = applyApiLogExportCustomMaskingToUrl(headerValue, rules);
      value[name] = masked.value;
      report.pathSegmentsRedacted += masked.pathSegmentsRedacted;
      report.queryValuesRedacted += masked.queryValuesRedacted;
    }
  });
};

const maskHeaderArray = (
  value: unknown,
  rules: ApiLogExportCustomMaskingRules,
  report: ApiLogExportCustomMaskingReport,
  side: MaskingSide
): void => {
  if (!Array.isArray(value)) return;
  value.forEach((entry) => {
    if (!isRecord(entry) || typeof entry.name !== 'string' || typeof entry.value !== 'string') return;
    if (matchesApiLogExportCustomRule(entry.name, rules.headerNames) && entry.value !== redactedValue) {
      entry.value = redactedValue;
      incrementHeaderReport(report, side);
    } else if (urlHeaderNames.has(entry.name.trim().toLowerCase())) {
      const masked = applyApiLogExportCustomMaskingToUrl(entry.value, rules);
      entry.value = masked.value;
      report.pathSegmentsRedacted += masked.pathSegmentsRedacted;
      report.queryValuesRedacted += masked.queryValuesRedacted;
    }
  });
};

const maskBodyRecord = (
  value: unknown,
  bodyRules: string[],
  report: ApiLogExportCustomMaskingReport,
  side: MaskingSide
): void => {
  if (!isRecord(value) || typeof value.content !== 'string') return;
  const contentType = typeof value.contentType === 'string' ? value.contentType : undefined;
  const result = maskBodyContent(value.content, contentType, bodyRules);
  if (!result) return;

  value.content = result.content;
  const existingPaths = Array.isArray(value.redactedFieldPaths)
    ? value.redactedFieldPaths.filter((item): item is string => typeof item === 'string')
    : [];
  value.redactedFieldPaths = [...new Set([...existingPaths, ...result.redactedPaths])];
  incrementBodyReport(report, side, result.redactedCount);
};

const maskTextBody = (
  record: Record<string, unknown>,
  property: string,
  contentType: string | undefined,
  bodyRules: string[],
  report: ApiLogExportCustomMaskingReport,
  side: MaskingSide
): void => {
  const value = record[property];
  if (typeof value !== 'string') return;
  const result = maskBodyContent(value, contentType, bodyRules);
  if (!result) return;
  record[property] = result.content;
  incrementBodyReport(report, side, result.redactedCount);
};

const maskBodyContent = (
  content: string,
  contentType: string | undefined,
  bodyRules: string[]
): { content: string; redactedCount: number; redactedPaths: string[] } | undefined => {
  if (bodyRules.length === 0) return undefined;
  const normalizedContentType = normalizeRequestBodyContentType(contentType);

  if (normalizedContentType === 'application/x-www-form-urlencoded') {
    const next = new URLSearchParams();
    const summary: MaskingSummary = { redactedCount: 0, redactedPaths: [] };
    for (const [name, value] of new URLSearchParams(content).entries()) {
      const shouldMask = matchesApiLogExportCustomRule(name, bodyRules) && value !== redactedValue;
      next.append(name, shouldMask ? redactedValue : value);
      if (shouldMask) {
        summary.redactedCount += 1;
        summary.redactedPaths.push(name);
      }
    }
    return { content: next.toString(), ...summary };
  }

  const isJson = normalizedContentType === 'application/json' || Boolean(normalizedContentType?.endsWith('+json'));
  if (!isJson) return undefined;

  const parsed: unknown = JSON.parse(content);
  const summary: MaskingSummary = { redactedCount: 0, redactedPaths: [] };
  return {
    content: JSON.stringify(maskJsonValue(parsed, bodyRules, '', summary)),
    ...summary
  };
};

const maskJsonValue = (
  value: unknown,
  bodyRules: string[],
  path: string,
  summary: MaskingSummary
): unknown => {
  if (Array.isArray(value)) {
    return value.map((item, index) => maskJsonValue(item, bodyRules, `${path}[${index}]`, summary));
  }
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([name, item]) => {
      const nextPath = path ? `${path}.${name}` : name;
      if (matchesApiLogExportCustomRule(name, bodyRules) && item !== redactedValue) {
        summary.redactedCount += 1;
        summary.redactedPaths.push(nextPath);
        return [name, redactedValue];
      }
      return [name, maskJsonValue(item, bodyRules, nextPath, summary)];
    })
  );
};

const incrementHeaderReport = (report: ApiLogExportCustomMaskingReport, side: MaskingSide): void => {
  if (side === 'request') report.requestHeaderValuesRedacted += 1;
  else report.responseHeaderValuesRedacted += 1;
};

const incrementBodyReport = (
  report: ApiLogExportCustomMaskingReport,
  side: MaskingSide,
  count: number
): void => {
  if (side === 'request') report.requestBodyFieldsRedacted += count;
  else report.responseBodyFieldsRedacted += count;
};

const toRuleCounts = (rules: ApiLogExportCustomMaskingRules): Record<string, number> => ({
  pathSegmentValues: rules.pathSegmentValues.length,
  queryNames: rules.queryNames.length,
  headerNames: rules.headerNames.length,
  bodyFieldNames: rules.bodyFieldNames.length
});

const splitRuleText = (value: string): string[] =>
  value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);

const findInvalidFieldCategory = (rules: ApiLogExportCustomMaskingRules): string | undefined => {
  const categories = [
    ['URL query', rules.queryNames],
    ['header', rules.headerNames],
    ['bodyフィールド', rules.bodyFieldNames]
  ] as const;

  for (const [label, values] of categories) {
    if (values.length > maxApiLogExportCustomRulesPerCategory) {
      return `${label}の追加ルールは最大${maxApiLogExportCustomRulesPerCategory}件です。`;
    }
    const normalized = new Set<string>();
    for (const value of values) {
      if (value.length === 0 || value.length > maxApiLogExportCustomRuleLength) {
        return `${label}の各ルールは1〜${maxApiLogExportCustomRuleLength}文字で入力してください。`;
      }
      if (/[\u0000-\u001f\u007f]/.test(value)) {
        return `${label}のルールに制御文字は使用できません。`;
      }
      const key = normalizeApiLogExportCustomRuleName(value);
      if (!key) return `${label}のルール名が不正です。`;
      if (normalized.has(key)) return `${label}に重複したルールがあります。`;
      normalized.add(key);
    }
  }
  return undefined;
};

const findInvalidPathSegmentCategory = (values: string[]): string | undefined => {
  if (values.length > maxApiLogExportCustomRulesPerCategory) {
    return `URL path segmentの追加ルールは最大${maxApiLogExportCustomRulesPerCategory}件です。`;
  }

  const normalized = new Set<string>();
  for (const value of values) {
    const key = normalizeApiLogExportPathSegmentValue(value);
    if (key.length === 0 || key.length > maxApiLogExportPathSegmentLength) {
      return `URL path segmentは1〜${maxApiLogExportPathSegmentLength}文字で入力してください。`;
    }
    if (/[\u0000-\u001f\u007f]/.test(value)) {
      return 'URL path segmentに制御文字は使用できません。';
    }
    if (key === '.' || key === '..' || key === apiLogExportRedactedPathSegment) {
      return 'URL path segmentとして予約値は指定できません。';
    }
    if (/[\\/]/.test(key)) {
      return 'URL path segmentにはスラッシュまたはバックスラッシュを含められません。';
    }
    if (normalized.has(key)) return 'URL path segmentに重複した値があります。';
    normalized.add(key);
  }
  return undefined;
};

const safeDecodePathSegment = (value: string): string | undefined => {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
};

const isRuleList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const normalizeRuleList = (values: string[]): string[] =>
  values.map((value) => value.normalize('NFKC').trim());

const normalizePathSegmentList = (values: string[]): string[] =>
  values.map(normalizeApiLogExportPathSegmentValue);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
