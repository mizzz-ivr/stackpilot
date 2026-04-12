import { describe, expect, it } from 'vitest';
import {
  buildRiskDialogContent,
  evaluateRequestRisk,
  isDangerousMethod,
  shouldShowRiskDialog,
  toRequestPath,
  type RiskConfirmationRequest
} from '../../shared/domain/risk';

describe('risk rules', () => {
  it('危険HTTPメソッドを判定できる', () => {
    expect(isDangerousMethod('POST')).toBe(true);
    expect(isDangerousMethod('patch')).toBe(true);
    expect(isDangerousMethod('GET')).toBe(false);
  });

  it('prod + mutating は warning', () => {
    const result = evaluateRequestRisk({ environmentType: 'prod', method: 'DELETE', url: 'https://example.com/users/1' });
    expect(result.level).toBe('warning');
    expect(result.reasonCode).toBe('prod-mutating');
    expect(result.shouldConfirm).toBe(true);
    expect(shouldShowRiskDialog(result)).toBe(true);
  });

  it('prod 以外または mutating 以外は none', () => {
    expect(evaluateRequestRisk({ environmentType: 'dev', method: 'POST', url: 'https://example.com' }).level).toBe('none');
    expect(evaluateRequestRisk({ environmentType: 'prod', method: 'GET', url: 'https://example.com' }).level).toBe('none');
  });

  it('ダイアログ表示文言を組み立てできる', () => {
    const request: RiskConfirmationRequest = {
      confirmationId: 'risk-1',
      workspaceId: 'ws-1',
      workspaceName: 'Main',
      environmentType: 'prod',
      method: 'POST',
      url: 'https://api.example.com/v1/users?limit=1',
      path: toRequestPath('https://api.example.com/v1/users?limit=1'),
      level: 'warning',
      reasonCode: 'prod-mutating'
    };

    const content = buildRiskDialogContent(request);
    expect(content.environmentLabel).toBe('PROD');
    expect(content.methodLabel).toBe('POST');
    expect(content.targetLabel).toBe('/v1/users?limit=1');
  });
});
