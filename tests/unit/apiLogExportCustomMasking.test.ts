import { describe, expect, it } from 'vitest';
import type { ApiLogEntry, Workspace } from '../../shared/contracts';
import { createSafeApiLogExport } from '../../shared/domain/apiLogExport';
import {
  applyApiLogExportCustomMasking,
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

describe('APIログの一時追加マスキング', () => {
  it('カンマ・改行区切りを解析し、正規化後の重複を拒否する', () => {
    expect(parseApiLogExportCustomMaskingRuleText({
      queryNamesText: 'employee_id, customerCode',
      headerNamesText: 'X-Internal-Reference\nX-Customer-ID',
      bodyFieldNamesText: 'email\nemployeeId'
    })).toEqual({
      status: 'valid',
      rules: {
        queryNames: ['employee_id', 'customerCode'],
        headerNames: ['X-Internal-Reference', 'X-Customer-ID'],
        bodyFieldNames: ['email', 'employeeId']
      }
    });

    expect(parseApiLogExportCustomMaskingRuleText({
      queryNamesText: 'employee_id, employeeId',
      headerNamesText: '',
      bodyFieldNamesText: ''
    })).toMatchObject({ status: 'invalid' });
  });

  it('runtime validationで非文字列・件数超過・制御文字を拒否する', () => {
    expect(isApiLogExportCustomMaskingRules({
      queryNames: ['employee_id'],
      headerNames: ['x-internal-reference'],
      bodyFieldNames: ['email']
    })).toBe(true);
    expect(isApiLogExportCustomMaskingRules({
      queryNames: [123],
      headerNames: [],
      bodyFieldNames: []
    })).toBe(false);
    expect(isApiLogExportCustomMaskingRules({
      queryNames: Array.from({ length: 21 }, (_, index) => `field-${index}`),
      headerNames: [],
      bodyFieldNames: []
    })).toBe(false);
    expect(isApiLogExportCustomMaskingRules({
      queryNames: ['employee\nname'],
      headerNames: [],
      bodyFieldNames: []
    })).toBe(false);
  });

  it('Safe JSONのquery・header・ネストJSON・配列内フィールドを追加伏字化する', () => {
    const baseArtifact = createSafeApiLogExport({
      workspace,
      logs: [createLog()],
      format: 'json',
      filterKind: 'all',
      exportedAt: 1_000
    });
    const result = applyApiLogExportCustomMasking(baseArtifact, {
      queryNames: ['employee_id'],
      headerNames: ['x_internal_reference'],
      bodyFieldNames: ['email', 'employee_id']
    });

    expect(result.report).toEqual({
      queryValuesRedacted: 1,
      requestHeaderValuesRedacted: 1,
      responseHeaderValuesRedacted: 1,
      requestBodyFieldsRedacted: 2,
      responseBodyFieldsRedacted: 2
    });
    expect(result.artifact.content).not.toContain('employee-001');
    expect(result.artifact.content).not.toContain('internal-001');
    expect(result.artifact.content).not.toContain('response-internal-001');
    expect(result.artifact.content).not.toContain('user@example.com');
    expect(result.artifact.content).toContain('<redacted>');
  });

  it('HARのURL・queryString・header・form-urlencodedへ同じ追加ルールを適用する', () => {
    const formLog = createLog({
      url: 'https://example.com/api/users?employee_id=employee-001',
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
          response: { headers: Array<{ name: string; value: string }> };
        }>;
      };
    };
    const entry = payload.log.entries[0];

    expect(entry.request.url).toContain('employee_id=%3Credacted%3E');
    expect(entry.request.queryString).toContainEqual({ name: 'employee_id', value: '<redacted>' });
    expect(entry.request.headers).toContainEqual({ name: 'x-internal-reference', value: '<redacted>' });
    expect(entry.response.headers).toContainEqual({ name: 'x-internal-reference', value: '<redacted>' });
    expect(entry.request.postData?.text).toContain('email=%3Credacted%3E');
    expect(entry.request.postData?.text).toContain('employee_id=%3Credacted%3E');
    expect(entry.request.postData?.text).toContain('public=value');
    expect(result.report.queryValuesRedacted).toBe(1);
    expect(result.report.requestBodyFieldsRedacted).toBe(2);
  });

  it('自動伏字済みの値を追加マスキング件数へ重複計上しない', () => {
    const alreadyRedacted = createLog({
      url: 'https://example.com/api?access_token=%3Credacted%3E',
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
      queryNames: ['access_token'],
      headerNames: ['authorization'],
      bodyFieldNames: ['password']
    });

    expect(result.report).toEqual({
      queryValuesRedacted: 0,
      requestHeaderValuesRedacted: 0,
      responseHeaderValuesRedacted: 0,
      requestBodyFieldsRedacted: 0,
      responseBodyFieldsRedacted: 0
    });
  });
});
