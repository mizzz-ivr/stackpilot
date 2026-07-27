import { describe, expect, it } from 'vitest';
import type { ApiLogEntry, Workspace } from '../../shared/contracts';
import { createSafeApiLogExport } from '../../shared/domain/apiLogExport';
import {
  apiLogExportRedactedPathSegment,
  applyApiLogExportCustomMasking,
  applyApiLogExportCustomMaskingToUrl,
  extractApiLogExportSelectablePathSegments,
  isApiLogExportCustomMaskingRules,
  parseApiLogExportCustomMaskingRuleText
} from '../../shared/domain/apiLogExportCustomMasking';

const workspace: Workspace = {
  id: 'workspace-1',
  name: 'Development',
  environmentType: 'dev',
  prodDomains: [],
  partitionKey: 'persist:workspace-1',
  tabs: [],
  createdAt: '2026-07-26T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z'
};

const createLog = (overrides: Partial<ApiLogEntry> = {}): ApiLogEntry => ({
  id: 'log-1',
  workspaceId: workspace.id,
  tabId: 'tab-1',
  type: 'fetch',
  method: 'POST',
  url: 'https://example.com/api/users?employee_id=employee-001&view=detail',
  status: 200,
  durationMs: 40,
  requestHeaders: {
    'content-type': 'application/json',
    'x-internal-reference': 'internal-001'
  },
  requestBody: {
    kind: 'json',
    contentType: 'application/json',
    content: '{"profile":{"email":"user@example.com"},"members":[{"employeeId":"employee-001"}]}',
    byteLength: 96,
    isTruncated: false,
    redactedFieldPaths: []
  },
  responseHeaders: {
    'content-type': 'application/json',
    'x-internal-reference': 'response-internal-001'
  },
  responseBody: {
    kind: 'json',
    contentType: 'application/json',
    content: '{"result":{"email":"user@example.com","employee_id":"employee-001"}}',
    byteLength: 80,
    isTruncated: false,
    redactedFieldPaths: []
  },
  startedAt: 100,
  finishedAt: 140,
  ...overrides
});

const emptyRules = () => ({
  pathSegmentValues: [],
  queryNames: [],
  headerNames: [],
  bodyFieldNames: []
});

describe('APIログの一時追加マスキング', () => {
  it('カンマ・改行区切りを解析し、項目名とpath値をそれぞれの規則で検証する', () => {
    expect(parseApiLogExportCustomMaskingRuleText({
      pathSegmentValuesText: 'Customer-001\ncustomer-001',
      queryNamesText: 'employee_id, customerCode',
      headerNamesText: 'X-Internal-Reference\nX-Customer-ID',
      bodyFieldNamesText: 'email\nemployeeId'
    })).toEqual({
      status: 'valid',
      rules: {
        pathSegmentValues: ['Customer-001', 'customer-001'],
        queryNames: ['employee_id', 'customerCode'],
        headerNames: ['X-Internal-Reference', 'X-Customer-ID'],
        bodyFieldNames: ['email', 'employeeId']
      }
    });

    expect(parseApiLogExportCustomMaskingRuleText({
      pathSegmentValuesText: '',
      queryNamesText: 'employee_id, employeeId',
      headerNamesText: '',
      bodyFieldNamesText: ''
    })).toMatchObject({ status: 'invalid' });

    expect(parseApiLogExportCustomMaskingRuleText({
      pathSegmentValuesText: '１２３, 123',
      queryNamesText: '',
      headerNamesText: '',
      bodyFieldNamesText: ''
    })).toMatchObject({ status: 'invalid' });
  });

  it('runtime validationでpathの予約値・区切り文字・件数超過・非文字列を拒否する', () => {
    expect(isApiLogExportCustomMaskingRules({
      pathSegmentValues: ['Customer-001', 'customer-001'],
      queryNames: ['employee_id'],
      headerNames: ['x-internal-reference'],
      bodyFieldNames: ['email']
    })).toBe(true);
    expect(isApiLogExportCustomMaskingRules({
      ...emptyRules(),
      pathSegmentValues: [123]
    })).toBe(false);
    expect(isApiLogExportCustomMaskingRules({
      ...emptyRules(),
      pathSegmentValues: ['/users/123']
    })).toBe(false);
    expect(isApiLogExportCustomMaskingRules({
      ...emptyRules(),
      pathSegmentValues: ['..']
    })).toBe(false);
    expect(isApiLogExportCustomMaskingRules({
      ...emptyRules(),
      pathSegmentValues: [apiLogExportRedactedPathSegment]
    })).toBe(false);
    expect(isApiLogExportCustomMaskingRules({
      ...emptyRules(),
      pathSegmentValues: Array.from({ length: 21 }, (_, index) => `segment-${index}`)
    })).toBe(false);
    expect(isApiLogExportCustomMaskingRules({
      ...emptyRules(),
      queryNames: ['employee\nname']
    })).toBe(false);
  });

  it('URL変換はpathの完全一致だけを伏字化し、hostnameと未指定queryを維持する', () => {
    const result = applyApiLogExportCustomMaskingToUrl(
      'https://customer-001.example.com/api/customer-001/orders/customer-001?value=customer-001',
      {
        ...emptyRules(),
        pathSegmentValues: ['customer-001']
      }
    );

    expect(result.pathSegmentsRedacted).toBe(2);
    expect(result.queryValuesRedacted).toBe(0);
    expect(result.value).toBe(
      'https://customer-001.example.com/api/%3Credacted-path%3E/orders/%3Credacted-path%3E?value=customer-001'
    );
  });

  it('percent-encoded path segmentをdecodeした値で完全一致する', () => {
    const result = applyApiLogExportCustomMaskingToUrl(
      'https://example.com/users/%E5%B1%B1%E7%94%B0%20%E5%A4%AA%E9%83%8E/profile',
      {
        ...emptyRules(),
        pathSegmentValues: ['山田 太郎']
      }
    );

    expect(result.pathSegmentsRedacted).toBe(1);
    expect(result.value).toBe('https://example.com/users/%3Credacted-path%3E/profile');
  });

  it('サンプル選択候補から空segment・予約値・伏字済みsegmentを除外する', () => {
    expect(extractApiLogExportSelectablePathSegments(
      'https://example.com/api//users/123/123/%3Credacted-path%3E'
    )).toEqual(['api', 'users', '123']);
    expect(extractApiLogExportSelectablePathSegments('not-a-url')).toEqual([]);
  });

  it('Safe JSONのpath・query・URL値header・ネストbodyを追加伏字化する', () => {
    const log = createLog({
      url: 'https://customer-001.example.com/api/customer-001/orders/customer-001?customer_id=customer-001',
      requestHeaders: {
        location: 'https://example.com/redirect/customer-001?customer_id=customer-001',
        'x-internal-reference': 'internal-001'
      },
      responseHeaders: {
        'content-location': 'https://example.com/result/customer-001',
        'x-internal-reference': 'response-internal-001'
      }
    });
    const baseArtifact = createSafeApiLogExport({
      workspace,
      logs: [log],
      format: 'json',
      filterKind: 'all',
      exportedAt: 1_000
    });
    const result = applyApiLogExportCustomMasking(baseArtifact, {
      pathSegmentValues: ['customer-001'],
      queryNames: ['customer_id'],
      headerNames: ['x_internal_reference'],
      bodyFieldNames: ['email', 'employee_id']
    });
    const payload = JSON.parse(result.artifact.content) as {
      logs: Array<{
        url: string;
        requestHeaders: Record<string, string>;
        responseHeaders: Record<string, string>;
      }>;
    };
    const exported = payload.logs[0];

    expect(result.report).toEqual({
      pathSegmentsRedacted: 4,
      queryValuesRedacted: 2,
      requestHeaderValuesRedacted: 1,
      responseHeaderValuesRedacted: 1,
      requestBodyFieldsRedacted: 2,
      responseBodyFieldsRedacted: 2
    });
    expect(exported.url).toContain('customer-001.example.com');
    expect(exported.url).toContain('/api/%3Credacted-path%3E/orders/%3Credacted-path%3E');
    expect(exported.url).toContain('customer_id=%3Credacted%3E');
    expect(exported.requestHeaders.location).toContain('/redirect/%3Credacted-path%3E');
    expect(exported.responseHeaders['content-location']).toContain('/result/%3Credacted-path%3E');
    expect(result.artifact.content).not.toContain('internal-001');
    expect(result.artifact.content).not.toContain('response-internal-001');
    expect(result.artifact.content).not.toContain('user@example.com');
  });

  it('HARのURL・redirectURL・queryString・header・form-urlencodedへ同じ追加ルールを適用する', () => {
    const formLog = createLog({
      url: 'https://example.com/api/employee-001?employee_id=employee-001',
      requestHeaders: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-internal-reference': 'internal-001'
      },
      requestBody: {
        kind: 'form',
        contentType: 'application/x-www-form-urlencoded',
        content: 'email=user%40example.com&employee_id=employee-001&public=value',
        byteLength: 72,
        isTruncated: false,
        redactedFieldPaths: []
      },
      responseHeaders: {
        location: 'https://example.com/next/employee-001',
        'x-internal-reference': 'response-internal-001'
      }
    });
    const baseArtifact = createSafeApiLogExport({
      workspace,
      logs: [formLog],
      format: 'har',
      filterKind: 'all',
      exportedAt: 1_000
    });
    const result = applyApiLogExportCustomMasking(baseArtifact, {
      pathSegmentValues: ['employee-001'],
      queryNames: ['employeeId'],
      headerNames: ['X-Internal-Reference'],
      bodyFieldNames: ['email', 'employeeId']
    });
    const payload = JSON.parse(result.artifact.content) as {
      log: {
        entries: Array<{
          request: {
            url: string;
            queryString: Array<{ name: string; value: string }>;
            headers: Array<{ name: string; value: string }>;
            postData?: { text: string };
          };
          response: {
            redirectURL: string;
            headers: Array<{ name: string; value: string }>;
          };
        }>;
      };
    };
    const entry = payload.log.entries[0];

    expect(entry.request.url).toContain('/api/%3Credacted-path%3E');
    expect(entry.request.url).toContain('employee_id=%3Credacted%3E');
    expect(entry.request.queryString).toContainEqual({ name: 'employee_id', value: '<redacted>' });
    expect(entry.request.headers).toContainEqual({ name: 'x-internal-reference', value: '<redacted>' });
    expect(entry.response.headers).toContainEqual({ name: 'x-internal-reference', value: '<redacted>' });
    expect(entry.response.redirectURL).toContain('/next/%3Credacted-path%3E');
    expect(entry.request.postData?.text).toContain('email=%3Credacted%3E');
    expect(entry.request.postData?.text).toContain('employee_id=%3Credacted%3E');
    expect(entry.request.postData?.text).toContain('public=value');
    expect(result.report.pathSegmentsRedacted).toBe(3);
    expect(result.report.queryValuesRedacted).toBe(1);
    expect(result.report.requestBodyFieldsRedacted).toBe(2);
  });

  it('伏字済みpath・query・header・bodyを追加件数へ重複計上しない', () => {
    const alreadyRedacted = createLog({
      url: 'https://example.com/api/%3Credacted-path%3E?access_token=%3Credacted%3E',
      requestHeaders: { authorization: '<redacted>' },
      responseHeaders: {},
      requestBody: {
        kind: 'json',
        contentType: 'application/json',
        content: '{"password":"<redacted>"}',
        byteLength: 24,
        isTruncated: false,
        redactedFieldPaths: ['password']
      },
      responseBody: undefined
    });
    const baseArtifact = createSafeApiLogExport({
      workspace,
      logs: [alreadyRedacted],
      format: 'json',
      filterKind: 'all',
      exportedAt: 1_000
    });
    const result = applyApiLogExportCustomMasking(baseArtifact, {
      pathSegmentValues: ['not-present'],
      queryNames: ['access_token'],
      headerNames: ['authorization'],
      bodyFieldNames: ['password']
    });

    expect(result.report).toEqual({
      pathSegmentsRedacted: 0,
      queryValuesRedacted: 0,
      requestHeaderValuesRedacted: 0,
      responseHeaderValuesRedacted: 0,
      requestBodyFieldsRedacted: 0,
      responseBodyFieldsRedacted: 0
    });
  });
});