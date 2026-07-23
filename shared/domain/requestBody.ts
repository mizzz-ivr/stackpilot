export const maxCapturedRequestBodyBytes = 16 * 1024;

export const requestBodyKinds = ['json', 'form', 'unavailable'] as const;
export type RequestBodyKind = (typeof requestBodyKinds)[number];

export const requestBodyUnavailableReasons = [
  'unsupported-content-type',
  'body-too-large',
  'unsupported-upload-data',
  'invalid-json',
  'decode-failed'
] as const;
export type RequestBodyUnavailableReason = (typeof requestBodyUnavailableReasons)[number];

export interface SafeRequestBodyPreview {
  kind: RequestBodyKind;
  contentType?: string;
  content?: string;
  byteLength: number;
  isTruncated: boolean;
  redactedFieldPaths: string[];
  unavailableReason?: RequestBodyUnavailableReason;
}

export interface CreateSafeRequestBodyPreviewInput {
  contentType?: string;
  rawBody?: string;
  byteLength: number;
  tooLarge?: boolean;
  unsupportedUpload?: boolean;
  decodeFailed?: boolean;
}

const sensitiveFieldNames = new Set([
  'password',
  'passwd',
  'passcode',
  'secret',
  'clientsecret',
  'privatekey',
  'signingkey',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'apikey',
  'authorization',
  'cookie',
  'session',
  'sessionid',
  'csrf',
  'csrftoken',
  'xsrf',
  'xsrftoken'
]);

export const normalizeRequestBodyContentType = (contentType?: string): string | undefined => {
  const normalized = contentType?.split(';', 1)[0]?.trim().toLowerCase();
  return normalized || undefined;
};

export const isSupportedRequestBodyContentType = (contentType?: string): boolean => {
  const normalized = normalizeRequestBodyContentType(contentType);
  return Boolean(
    normalized &&
      (normalized === 'application/json' ||
        (normalized.startsWith('application/') && normalized.endsWith('+json')) ||
        normalized === 'application/x-www-form-urlencoded')
  );
};

export const isSensitiveRequestBodyFieldName = (name: string): boolean => {
  const normalized = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return [...sensitiveFieldNames].some((candidate) => normalized === candidate || normalized.endsWith(candidate));
};

export const createSafeRequestBodyPreview = (
  input: CreateSafeRequestBodyPreviewInput
): SafeRequestBodyPreview | undefined => {
  const contentType = normalizeRequestBodyContentType(input.contentType);
  if (input.unsupportedUpload) {
    return unavailablePreview('unsupported-upload-data', input.byteLength, contentType);
  }
  if (input.byteLength <= 0) return undefined;
  if (input.tooLarge || input.byteLength > maxCapturedRequestBodyBytes) {
    return unavailablePreview('body-too-large', input.byteLength, contentType, true);
  }
  if (input.decodeFailed || input.rawBody === undefined) {
    return unavailablePreview('decode-failed', input.byteLength, contentType);
  }
  if (!isSupportedRequestBodyContentType(contentType)) {
    return unavailablePreview('unsupported-content-type', input.byteLength, contentType);
  }

  const supportedContentType = contentType as string;
  if (supportedContentType === 'application/x-www-form-urlencoded') {
    return sanitizeFormBody(input.rawBody, input.byteLength, supportedContentType);
  }

  return sanitizeJsonBody(input.rawBody, input.byteLength, supportedContentType);
};

export const formatRequestBodyUnavailableReason = (reason?: RequestBodyUnavailableReason): string => {
  if (reason === 'unsupported-content-type') return '対象外のContent-Typeのため取得していません。';
  if (reason === 'body-too-large') return '16KiBを超えるため内容を取得していません。';
  if (reason === 'unsupported-upload-data') return 'file・blob・multipart等のため内容を取得していません。';
  if (reason === 'invalid-json') return 'JSONとして解析できないため内容を表示していません。';
  if (reason === 'decode-failed') return 'UTF-8として安全に読み取れないため内容を表示していません。';
  return 'Request bodyは取得されていません。';
};

const sanitizeJsonBody = (
  rawBody: string,
  byteLength: number,
  contentType: string
): SafeRequestBodyPreview => {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    const redactedFieldPaths = new Set<string>();
    const sanitized = redactJsonValue(parsed, '', redactedFieldPaths);
    return {
      kind: 'json',
      contentType,
      content: JSON.stringify(sanitized),
      byteLength,
      isTruncated: false,
      redactedFieldPaths: [...redactedFieldPaths].sort()
    };
  } catch {
    return unavailablePreview('invalid-json', byteLength, contentType);
  }
};

const sanitizeFormBody = (
  rawBody: string,
  byteLength: number,
  contentType: string
): SafeRequestBodyPreview => {
  const source = new URLSearchParams(rawBody);
  const sanitized = new URLSearchParams();
  const redactedFieldPaths = new Set<string>();

  source.forEach((value, key) => {
    if (isSensitiveRequestBodyFieldName(key)) {
      sanitized.append(key, '<redacted>');
      redactedFieldPaths.add(key);
    } else {
      sanitized.append(key, value);
    }
  });

  return {
    kind: 'form',
    contentType,
    content: sanitized.toString(),
    byteLength,
    isTruncated: false,
    redactedFieldPaths: [...redactedFieldPaths].sort()
  };
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

const unavailablePreview = (
  unavailableReason: RequestBodyUnavailableReason,
  byteLength: number,
  contentType?: string,
  isTruncated = false
): SafeRequestBodyPreview => ({
  kind: 'unavailable',
  contentType,
  byteLength,
  isTruncated,
  redactedFieldPaths: [],
  unavailableReason
});
