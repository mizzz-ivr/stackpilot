import { isSensitiveRequestBodyFieldName } from './requestBody';

export const maxCapturedResponseBodyBytes = 64 * 1024;

export const responseBodyKinds = ['json', 'unavailable'] as const;
export type ResponseBodyKind = (typeof responseBodyKinds)[number];

export const responseBodyUnavailableReasons = [
  'unsupported-content-type',
  'body-too-large',
  'invalid-json',
  'decode-failed',
  'capture-unavailable',
  'devtools-open',
  'body-unavailable'
] as const;
export type ResponseBodyUnavailableReason = (typeof responseBodyUnavailableReasons)[number];

export interface SafeResponseBodyPreview {
  kind: ResponseBodyKind;
  contentType?: string;
  content?: string;
  byteLength: number;
  isTruncated: boolean;
  redactedFieldPaths: string[];
  unavailableReason?: ResponseBodyUnavailableReason;
}

export interface CreateSafeResponseBodyPreviewInput {
  contentType?: string;
  rawBody?: string;
  byteLength: number;
  tooLarge?: boolean;
  decodeFailed?: boolean;
  unavailableReason?: ResponseBodyUnavailableReason;
}

export const normalizeResponseBodyContentType = (contentType?: string): string | undefined => {
  const normalized = contentType?.split(';', 1)[0]?.trim().toLowerCase();
  return normalized || undefined;
};

export const isSupportedResponseBodyContentType = (contentType?: string): boolean => {
  const normalized = normalizeResponseBodyContentType(contentType);
  return Boolean(
    normalized &&
      (normalized === 'application/json' ||
        (normalized.startsWith('application/') && normalized.endsWith('+json')))
  );
};

export const createSafeResponseBodyPreview = (
  input: CreateSafeResponseBodyPreviewInput
): SafeResponseBodyPreview | undefined => {
  const contentType = normalizeResponseBodyContentType(input.contentType);

  if (input.unavailableReason) {
    return createUnavailableResponseBodyPreview(input.unavailableReason, contentType, input.byteLength);
  }
  if (input.tooLarge || input.byteLength > maxCapturedResponseBodyBytes) {
    return createUnavailableResponseBodyPreview('body-too-large', contentType, input.byteLength, true);
  }
  if (!isSupportedResponseBodyContentType(contentType)) {
    return createUnavailableResponseBodyPreview('unsupported-content-type', contentType, input.byteLength);
  }
  if (input.byteLength <= 0) return undefined;
  if (input.decodeFailed || input.rawBody === undefined) {
    return createUnavailableResponseBodyPreview('decode-failed', contentType, input.byteLength);
  }

  try {
    const parsed: unknown = JSON.parse(input.rawBody);
    const redactedFieldPaths = new Set<string>();
    const sanitized = redactJsonValue(parsed, '', redactedFieldPaths);

    return {
      kind: 'json',
      contentType: contentType as string,
      content: JSON.stringify(sanitized),
      byteLength: input.byteLength,
      isTruncated: false,
      redactedFieldPaths: [...redactedFieldPaths].sort()
    };
  } catch {
    return createUnavailableResponseBodyPreview('invalid-json', contentType, input.byteLength);
  }
};

export const createUnavailableResponseBodyPreview = (
  unavailableReason: ResponseBodyUnavailableReason,
  contentType?: string,
  byteLength = 0,
  isTruncated = false
): SafeResponseBodyPreview => ({
  kind: 'unavailable',
  contentType: normalizeResponseBodyContentType(contentType),
  byteLength,
  isTruncated,
  redactedFieldPaths: [],
  unavailableReason
});

export const formatResponseBodyUnavailableReason = (reason?: ResponseBodyUnavailableReason): string => {
  if (reason === 'unsupported-content-type') return 'JSON以外のContent-Typeのため取得していません。';
  if (reason === 'body-too-large') return '64KiBを超えるため内容を取得していません。';
  if (reason === 'invalid-json') return 'JSONとして解析できないため内容を表示していません。';
  if (reason === 'decode-failed') return 'UTF-8として安全に読み取れないため内容を表示していません。';
  if (reason === 'devtools-open') return 'DevTools起動中のためResponse bodyを取得できません。';
  if (reason === 'capture-unavailable') return 'Response body取得機能へ接続できませんでした。';
  if (reason === 'body-unavailable') return 'ChromiumからResponse bodyを取得できませんでした。';
  return 'Response bodyは取得されていません。';
};

const redactJsonValue = (
  value: unknown,
  path: string,
  redactedFieldPaths: Set<string>
): unknown => {
  if (Array.isArray(value)) {
    return value.map((item, index) => redactJsonValue(item, `${path}[${index}]`, redactedFieldPaths));
  }

  if (typeof value !== 'object' || value === null) return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => {
      const childPath = path ? `${path}.${key}` : key;
      if (isSensitiveRequestBodyFieldName(key)) {
        redactedFieldPaths.add(childPath);
        return [key, '<redacted>'];
      }
      return [key, redactJsonValue(child, childPath, redactedFieldPaths)];
    })
  );
};
