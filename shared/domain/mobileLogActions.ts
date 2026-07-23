import {
  formatDurationLabel,
  formatMethodLabel,
  formatStartedAtLabel,
  type NetworkLog
} from './inspector';
import {
  formatRequestBodyUnavailableReason,
  type SafeRequestBodyPreview
} from './requestBody';

const sensitiveHeaderNames = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'api-key',
  'x-auth-token',
  'x-csrf-token',
  'x-xsrf-token'
]);

const omittedCurlHeaderNames = new Set([
  'connection',
  'content-length',
  'host'
]);

export interface MobileLogActionArtifacts {
  url: string;
  json?: string;
  curl: string;
  summary: string;
  redactedHeaderNames: string[];
  redactedRequestBodyFieldPaths: string[];
  requestBodyIncluded: boolean;
  requestBodyNote: string;
}

export const isSensitiveHeaderName = (name: string): boolean =>
  sensitiveHeaderNames.has(name.trim().toLowerCase());

export const createCopyableJson = (body?: string): string | undefined => {
  if (!body?.trim()) return undefined;

  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return undefined;
  }
};

export const canIncludeRequestBodyInCurl = (
  requestBody?: SafeRequestBodyPreview
): requestBody is SafeRequestBodyPreview & { content: string } =>
  Boolean(
    requestBody &&
      requestBody.kind !== 'unavailable' &&
      requestBody.content &&
      !requestBody.isTruncated
  );

export const buildRedactedCurlCommand = (log: NetworkLog): string => {
  const lines = [`curl --request ${formatMethodLabel(log.method)}`];

  Object.entries(log.requestHeaders)
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([name, value]) => {
      const normalizedName = name.trim().toLowerCase();
      if (omittedCurlHeaderNames.has(normalizedName)) return;

      const safeValue = isSensitiveHeaderName(normalizedName) ? '<redacted>' : value;
      lines.push(`--header ${quoteShellArgument(`${name}: ${safeValue}`)}`);
    });

  if (canIncludeRequestBodyInCurl(log.requestBody)) {
    lines.push(`--data-raw ${quoteShellArgument(log.requestBody.content)}`);
  }

  lines.push(quoteShellArgument(log.url));
  return lines.join(' \\\n  ');
};

export const createMobileLogActionArtifacts = (log: NetworkLog): MobileLogActionArtifacts => {
  const curl = buildRedactedCurlCommand(log);
  const redactedHeaderNames = Object.keys(log.requestHeaders)
    .filter(isSensitiveHeaderName)
    .sort((left, right) => left.localeCompare(right));
  const requestBodyIncluded = canIncludeRequestBodyInCurl(log.requestBody);
  const requestBodyNote = createRequestBodyNote(log.requestBody, requestBodyIncluded);
  const statusLabel = log.status ?? '通信エラー';

  return {
    url: log.url,
    json: createCopyableJson(log.responseBodySnippet),
    curl,
    redactedHeaderNames,
    redactedRequestBodyFieldPaths: log.requestBody?.redactedFieldPaths ?? [],
    requestBodyIncluded,
    requestBodyNote,
    summary: [
      'Stackpilot Inspector',
      `${formatMethodLabel(log.method)} ${statusLabel} · ${formatDurationLabel(log.durationMs)}`,
      log.url,
      `開始時刻: ${formatStartedAtLabel(log.startedAt)}`,
      '',
      'cURL（機密ヘッダー・Request body項目は伏字）',
      curl,
      '',
      requestBodyNote
    ].join('\n')
  };
};

const createRequestBodyNote = (
  requestBody: SafeRequestBodyPreview | undefined,
  requestBodyIncluded: boolean
): string => {
  if (!requestBody) return '注: Request bodyは取得されていません。';
  if (requestBodyIncluded) {
    return requestBody.redactedFieldPaths.length > 0
      ? `注: Request bodyを含みます。伏字項目: ${requestBody.redactedFieldPaths.join(', ')}`
      : '注: Request bodyを含みます。';
  }
  return `注: Request bodyはcURLに含めていません。${formatRequestBodyUnavailableReason(requestBody.unavailableReason)}`;
};

const quoteShellArgument = (value: string): string =>
  `'${value.replace(/'/g, "'\\''")}'`;
