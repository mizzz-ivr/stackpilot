import {
  createPayloadPreview,
  formatDurationLabel,
  formatMethodLabel,
  type NetworkLog
} from './inspector';

export const maxApiLogComparisonTargets = 2;

export type ComparisonDifferenceKind = 'same' | 'different' | 'left-only' | 'right-only';

export interface ScalarComparisonRow {
  key: 'method' | 'url' | 'resource-type' | 'status' | 'duration';
  label: string;
  left: string;
  right: string;
  difference: ComparisonDifferenceKind;
}

export interface HeaderComparisonRow {
  name: string;
  left?: string;
  right?: string;
  difference: ComparisonDifferenceKind;
}

export interface ComparableBody {
  state: 'none' | 'available' | 'unavailable';
  kind: string;
  contentType?: string;
  content?: string;
  byteLength?: number;
  isTruncated: boolean;
  unavailableReason?: string;
  redactedFieldPaths: string[];
}

export interface BodyComparison {
  left: ComparableBody;
  right: ComparableBody;
  difference: ComparisonDifferenceKind;
}

export interface ApiLogComparison {
  summary: ScalarComparisonRow[];
  requestHeaders: HeaderComparisonRow[];
  responseHeaders: HeaderComparisonRow[];
  requestBody: BodyComparison;
  responseBody: BodyComparison;
  hasDifferences: boolean;
}

export interface ApiLogComparisonView {
  summary: ScalarComparisonRow[];
  requestHeaders: HeaderComparisonRow[];
  responseHeaders: HeaderComparisonRow[];
  requestBody?: BodyComparison;
  responseBody?: BodyComparison;
  counts: {
    total: number;
    different: number;
    visible: number;
  };
  hasDifferences: boolean;
  differencesOnly: boolean;
}

export const reconcileComparisonLogIds = (
  logs: NetworkLog[],
  comparisonLogIds: string[]
): string[] => {
  const availableIds = new Set(logs.map((log) => log.id));
  const uniqueIds: string[] = [];

  for (const logId of comparisonLogIds) {
    if (!availableIds.has(logId) || uniqueIds.includes(logId)) continue;
    uniqueIds.push(logId);
    if (uniqueIds.length === maxApiLogComparisonTargets) break;
  }

  return uniqueIds;
};

export const toggleComparisonLogId = (
  logs: NetworkLog[],
  comparisonLogIds: string[],
  logId: string
): string[] => {
  const reconciled = reconcileComparisonLogIds(logs, comparisonLogIds);
  if (!logs.some((log) => log.id === logId)) return reconciled;
  if (reconciled.includes(logId)) return reconciled.filter((id) => id !== logId);
  if (reconciled.length >= maxApiLogComparisonTargets) return reconciled;
  return [...reconciled, logId];
};

export const selectComparisonLogs = (
  logs: NetworkLog[],
  comparisonLogIds: string[]
): NetworkLog[] => {
  const logById = new Map(logs.map((log) => [log.id, log]));
  return reconcileComparisonLogIds(logs, comparisonLogIds)
    .map((logId) => logById.get(logId))
    .filter((log): log is NetworkLog => Boolean(log));
};

export const compareNetworkLogs = (left: NetworkLog, right: NetworkLog): ApiLogComparison => {
  const summary = [
    createScalarRow('method', 'Method', formatMethodLabel(left.method), formatMethodLabel(right.method)),
    createScalarRow('url', 'URL', left.url, right.url),
    createScalarRow('resource-type', 'Resource type', left.resourceType, right.resourceType),
    createScalarRow('status', 'Status', formatStatus(left.status), formatStatus(right.status)),
    createScalarRow('duration', 'Duration', formatDurationLabel(left.durationMs), formatDurationLabel(right.durationMs))
  ];
  const requestHeaders = compareHeaders(left.requestHeaders, right.requestHeaders);
  const responseHeaders = compareHeaders(left.responseHeaders, right.responseHeaders);
  const requestBody = compareBodies(createComparableRequestBody(left), createComparableRequestBody(right));
  const responseBody = compareBodies(createComparableResponseBody(left), createComparableResponseBody(right));

  return {
    summary,
    requestHeaders,
    responseHeaders,
    requestBody,
    responseBody,
    hasDifferences:
      summary.some(isDifferentRow) ||
      requestHeaders.some(isDifferentRow) ||
      responseHeaders.some(isDifferentRow) ||
      requestBody.difference !== 'same' ||
      responseBody.difference !== 'same'
  };
};

export const createApiLogComparisonView = (
  comparison: ApiLogComparison,
  differencesOnly: boolean
): ApiLogComparisonView => {
  const differentSummary = comparison.summary.filter(isDifferentRow);
  const differentRequestHeaders = comparison.requestHeaders.filter(isDifferentRow);
  const differentResponseHeaders = comparison.responseHeaders.filter(isDifferentRow);
  const requestBodyIsDifferent = comparison.requestBody.difference !== 'same';
  const responseBodyIsDifferent = comparison.responseBody.difference !== 'same';
  const total =
    comparison.summary.length +
    comparison.requestHeaders.length +
    comparison.responseHeaders.length +
    2;
  const different =
    differentSummary.length +
    differentRequestHeaders.length +
    differentResponseHeaders.length +
    Number(requestBodyIsDifferent) +
    Number(responseBodyIsDifferent);

  return {
    summary: differencesOnly ? differentSummary : comparison.summary,
    requestHeaders: differencesOnly ? differentRequestHeaders : comparison.requestHeaders,
    responseHeaders: differencesOnly ? differentResponseHeaders : comparison.responseHeaders,
    requestBody: differencesOnly && !requestBodyIsDifferent ? undefined : comparison.requestBody,
    responseBody: differencesOnly && !responseBodyIsDifferent ? undefined : comparison.responseBody,
    counts: {
      total,
      different,
      visible: differencesOnly ? different : total
    },
    hasDifferences: comparison.hasDifferences,
    differencesOnly
  };
};

const createScalarRow = (
  key: ScalarComparisonRow['key'],
  label: string,
  left: string,
  right: string
): ScalarComparisonRow => ({
  key,
  label,
  left,
  right,
  difference: left === right ? 'same' : 'different'
});

const compareHeaders = (
  leftHeaders: Record<string, string>,
  rightHeaders: Record<string, string>
): HeaderComparisonRow[] => {
  const left = normalizeHeaders(leftHeaders);
  const right = normalizeHeaders(rightHeaders);
  const names = [...new Set([...left.keys(), ...right.keys()])].sort((a, b) => a.localeCompare(b));

  return names.map((name) => {
    const leftValue = left.get(name);
    const rightValue = right.get(name);
    return {
      name,
      left: leftValue,
      right: rightValue,
      difference: compareOptionalValues(leftValue, rightValue)
    };
  });
};

const normalizeHeaders = (headers: Record<string, string>): Map<string, string> => {
  const normalized = new Map<string, string>();
  for (const [name, value] of Object.entries(headers)) {
    normalized.set(name.trim().toLocaleLowerCase('en-US'), value);
  }
  return normalized;
};

const compareOptionalValues = (
  left: string | undefined,
  right: string | undefined
): ComparisonDifferenceKind => {
  if (left === undefined && right === undefined) return 'same';
  if (left === undefined) return 'right-only';
  if (right === undefined) return 'left-only';
  return left === right ? 'same' : 'different';
};

const createComparableRequestBody = (log: NetworkLog): ComparableBody => {
  const body = log.requestBody;
  if (!body) return emptyBody();

  return {
    state: body.kind === 'unavailable' ? 'unavailable' : 'available',
    kind: body.kind,
    contentType: body.contentType,
    content: normalizeBodyContent(body.content),
    byteLength: body.byteLength,
    isTruncated: body.isTruncated,
    unavailableReason: body.unavailableReason,
    redactedFieldPaths: [...body.redactedFieldPaths].sort()
  };
};

const createComparableResponseBody = (log: NetworkLog): ComparableBody => {
  const body = log.responseBody;
  if (body) {
    return {
      state: body.kind === 'unavailable' ? 'unavailable' : 'available',
      kind: body.kind,
      contentType: body.contentType,
      content: normalizeBodyContent(body.content),
      byteLength: body.byteLength,
      isTruncated: body.isTruncated,
      unavailableReason: body.unavailableReason,
      redactedFieldPaths: [...body.redactedFieldPaths].sort()
    };
  }

  if (log.responseBodySnippet?.trim()) {
    return {
      state: 'available',
      kind: 'text',
      content: normalizeBodyContent(log.responseBodySnippet),
      isTruncated: false,
      redactedFieldPaths: []
    };
  }

  return emptyBody();
};

const emptyBody = (): ComparableBody => ({
  state: 'none',
  kind: 'none',
  isTruncated: false,
  redactedFieldPaths: []
});

const normalizeBodyContent = (content?: string): string | undefined => {
  if (!content?.trim()) return undefined;
  return createPayloadPreview(content, Number.MAX_SAFE_INTEGER).content;
};

const compareBodies = (left: ComparableBody, right: ComparableBody): BodyComparison => ({
  left,
  right,
  difference: bodySignature(left) === bodySignature(right) ? 'same' : 'different'
});

const bodySignature = (body: ComparableBody): string =>
  JSON.stringify({
    state: body.state,
    kind: body.kind,
    contentType: body.contentType ?? null,
    content: body.content ?? null,
    byteLength: body.byteLength ?? null,
    isTruncated: body.isTruncated,
    unavailableReason: body.unavailableReason ?? null,
    redactedFieldPaths: body.redactedFieldPaths
  });

const isDifferentRow = (row: { difference: ComparisonDifferenceKind }): boolean =>
  row.difference !== 'same';

const formatStatus = (status?: number): string =>
  typeof status === 'number' ? String(status) : '通信エラー';
