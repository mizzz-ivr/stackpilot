import type { SafeApiLogExportArtifact } from './apiLogExport';
import { normalizeRequestBodyContentType } from './requestBody';

export const maxApiLogExportCustomRulesPerCategory = 20;
export const maxApiLogExportCustomRuleLength = 64;

export interface ApiLogExportCustomMaskingRules {
  queryNames: string[];
  headerNames: string[];
  bodyFieldNames: string[];
}

export interface ApiLogExportCustomMaskingReport {
  queryValuesRedacted: number;
  requestHeaderValuesRedacted: number;
  responseHeaderValuesRedacted: number;
  requestBodyFieldsRedacted: number;
  responseBodyFieldsRedacted: number;
}

export type ApiLogExportCustomRuleParseResult =
  | { status: 'valid'; rules: ApiLogExportCustomMaskingRules }
  | { status: 'invalid'; errorMessage: string };

const urlHeaderNames = new Set(['location', 'content-location', 'referer', 'referrer']);
const redactedValue = '<redacted>';

export const emptyApiLogExportCustomMaskingRules = (): ApiLogExportCustomMaskingRules => ({
  queryNames: [],
  headerNames: [],
  bodyFieldNames: []
});

export const createEmptyApiLogExportCustomMaskingReport = (): ApiLogExportCustomMaskingReport => ({
  queryValuesRedacted: 0,
  requestHeaderValuesRedacted: 0,
  responseHeaderValuesRedacted: 0,
  requestBodyFieldsRedacted: 0,
  responseBodyFieldsRedacted: 0
});

export const normalizeApiLogExportCustomRuleName = (value: string): string =>
  value.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/[\s_-]+/g, '');

export const isApiLogExportCustomMaskingRules = (value: unknown): value is ApiLogExportCustomMaskingRules => {
  if (!isRecord(value)) return false;
  return (
    isRuleList(value.queryNames) &&
    isRuleList(value.headerNames) &&
    isRuleList(value.bodyFieldNames)
  );
};

export const normalizeApiLogExportCustomMaskingRules = (
  rules?: ApiLogExportCustomMaskingRules
): ApiLogExportCustomMaskingRules => ({
  queryNames: normalizeRuleList(rules?.queryNames ?? []),
  headerNames: normalizeRuleList(rules?.headerNames ?? []),
  bodyFieldNames: normalizeRuleList(rules?.bodyFieldNames ?? [])
});

export const hasApiLogExportCustomMaskingRules = (rules?: ApiLogExportCustomMaskingRules): boolean => {
  const normalized = normalizeApiLogExportCustomMaskingRules(rules);
  return normalized.queryNames.length + normalized.headerNames.length + normalized.bodyFieldNames.length > 0;
};

export const parseApiLogExportCustomMaskingRuleText = (input: {
  queryNamesText: string;
  headerNamesText: string;
  bodyFieldNamesText: string;
}): ApiLogExportCustomRuleParseResult => {
  const rules: ApiLogExportCustomMaskingRules = {
    queryNames: splitRuleText(input.queryNamesText),
    headerNames: splitRuleText(input.headerNamesText),
    bodyFieldNames: splitRuleText(input.bodyFieldNamesText)
  };

  const invalidCategory = findInvalidCategory(rules);
  if (invalidCategory) return { status: 'invalid', errorMessage: invalidCategory };
  return { status: 'valid', rules: normalizeApiLogExportCustomMaskingRules(rules) };
};

export const matchesApiLogExportCustomRule = (name: string, rules: string[]): boolean => {
  const normalized = normalizeApiLogExportCustomRuleName(name);
  return normalized.length > 0 && rules.some((rule) => normalizeApiLogExportCustomRuleName(rule) === normalized);
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

  if (artifact.extension === 'json') {
    applyToSafeJsonPayload(payload, rules, report);
  } else {
    applyToHarPayload(payload, rules, report);
  }

  return {
    artifact: {
      ...artifact,
      content: `${JSON.stringify(payload, null, 2)}\n`
    },
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
    maskUrlProperty(value, 'url', rules.queryNames, report, true);
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
      maskUrlProperty(request, 'url', rules.queryNames, report, true);
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
      maskUrlProperty(response, 'redirectURL', rules.queryNames, report, true);
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
  queryRules: string[],
  report: ApiLogExportCustomMaskingReport,
  countChanges: boolean
): void => {
  const value = record[property];
  if (typeof value !== 'string' || queryRules.length === 0) return;
  const result = maskUrlQueryValues(value, queryRules);
  record[property] = result.value;
  if (countChanges) report.queryValuesRedacted += result.redactedCount;
};

const maskUrlQueryValues = (value: string, queryRules: string[]): { value: string; redactedCount: number } => {
  try {
    const url = new URL(value);
    let redactedCount = 0;
    const entries = [...url.searchParams.entries()];
    url.search = '';
    entries.forEach(([name, itemValue]) => {
      if (matchesApiLogExportCustomRule(name, queryRules) && itemValue !== redactedValue) {
        url.searchParams.append(name, redactedValue);
        redactedCount += 1;
      } else {
        url.searchParams.append(name, itemValue);
      }
    });
    return { value: url.toString(), redactedCount };
  } catch {
    return { value, redactedCount: 0 };
  }
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
  side: 'request' | 'response'
): void => {
  if (!isRecord(value)) return;
  Object.entries(value).forEach(([name, headerValue]) => {
    if (typeof headerValue !== 'string') return;
    if (matchesApiLogExportCustomRule(name, rules.headerNames) && headerValue !== redactedValue) {
      value[name] = redactedValue;
      incrementHeaderReport(report, side);
      return;
    }
    if (urlHeaderNames.has(name.trim().toLowerCase())) {
      const masked = maskUrlQueryValues(headerValue, rules.queryNames);
      value[name] = masked.value;
      report.queryValuesRedacted += masked.redactedCount;
    }
  });
};

const maskHeaderArray = (
  value: unknown,
  rules: ApiLogExportCustomMaskingRules,
  report: ApiLogExportCustomMaskingReport,
  side: 'request' | 'response'
): void => {
  if (!Array.isArray(value)) return;
  value.forEach((entry) => {
    if (!isRecord(entry) || typeof entry.name !== 'string' || typeof entry.value !== 'string') return;
    if (matchesApiLogExportCustomRule(entry.name, rules.headerNames) && entry.value !== redactedValue) {
      entry.value = redactedValue;
      incrementHeaderReport(report, side);
      return;
    }
    if (urlHeaderNames.has(entry.name.trim().toLowerCase())) {
      const masked = maskUrlQueryValues(entry.value, rules.queryNames);
      entry.value = masked.value;
      report.queryValuesRedacted += masked.redactedCount;
    }
  });
};

const maskBodyRecord = (
  value: unknown,
  bodyRules: string[],
  report: ApiLogExportCustomMaskingReport,
  side: 'request' | 'response'
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
  side: 'request' | 'response'
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
    let redactedCount = 0;
    const redactedPaths: string[] = [];
    for (const [name, value] of new URLSearchParams(content).entries()) {
      if (matchesApiLogExportCustomRule(name, bodyRules) && value !== redactedValue) {
        next.append(name, redactedValue);
        redactedCount += 1;
        redactedPaths.push(name);
      } else {
        next.append(name, value);
      }
    }
    return { content: next.toString(), redactedCount, redactedPaths };
  }

  const isJson = normalizedContentType === 'application/json' || Boolean(normalizedContentType?.endsWith('+json'));
  if (!isJson) return undefined;

  const parsed: unknown = JSON.parse(content);
  const summary = { redactedCount: 0, redactedPaths: [] as string[] };
  const masked = maskJsonValue(parsed, bodyRules, '', summary);
  return {
    content: JSON.stringify(masked),
    redactedCount: summary.redactedCount,
    redactedPaths: summary.redactedPaths
  };
};

const maskJsonValue = (
  value: unknown,
  bodyRules: string[],
  path: string,
  summary: { redactedCount: number; redactedPaths: string[] }
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

const incrementHeaderReport = (
  report: ApiLogExportCustomMaskingReport,
  side: 'request' | 'response'
): void => {
  if (side === 'request') report.requestHeaderValuesRedacted += 1;
  else report.responseHeaderValuesRedacted += 1;
};

const incrementBodyReport = (
  report: ApiLogExportCustomMaskingReport,
  side: 'request' | 'response',
  count: number
): void => {
  if (side === 'request') report.requestBodyFieldsRedacted += count;
  else report.responseBodyFieldsRedacted += count;
};

const toRuleCounts = (rules: ApiLogExportCustomMaskingRules): Record<string, number> => ({
  queryNames: rules.queryNames.length,
  headerNames: rules.headerNames.length,
  bodyFieldNames: rules.bodyFieldNames.length
});

const splitRuleText = (value: string): string[] =>
  value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const findInvalidCategory = (rules: ApiLogExportCustomMaskingRules): string | undefined => {
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

const isRuleList = (value: unknown): value is string[] => {
  if (!Array.isArray(value)) return false;
  return !findInvalidCategory({ queryNames: value as string[], headerNames: [], bodyFieldNames: [] });
};

const normalizeRuleList = (values: string[]): string[] =>
  values.map((value) => value.normalize('NFKC').trim());

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
