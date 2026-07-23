import {
  formatDurationLabel,
  formatMethodLabel,
  formatStartedAtLabel,
  type NetworkLog
} from './inspector';

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
  requestBodyIncluded: false;
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

  lines.push(quoteShellArgument(log.url));
  return lines.join(' \\\n  ');
};

export const createMobileLogActionArtifacts = (log: NetworkLog): MobileLogActionArtifacts => {
  const curl = buildRedactedCurlCommand(log);
  const redactedHeaderNames = Object.keys(log.requestHeaders)
    .filter(isSensitiveHeaderName)
    .sort((left, right) => left.localeCompare(right));
  const statusLabel = log.status ?? '通信エラー';

  return {
    url: log.url,
    json: createCopyableJson(log.responseBodySnippet),
    curl,
    redactedHeaderNames,
    requestBodyIncluded: false,
    summary: [
      'Stackpilot Inspector',
      `${formatMethodLabel(log.method)} ${statusLabel} · ${formatDurationLabel(log.durationMs)}`,
      log.url,
      `開始時刻: ${formatStartedAtLabel(log.startedAt)}`,
      '',
      'cURL（機密ヘッダーは伏字）',
      curl,
      '',
      '注: 現在のログにはRequest bodyが含まれていません。'
    ].join('\n')
  };
};

const quoteShellArgument = (value: string): string =>
  `'${value.replace(/'/g, "'\\''")}'`;
