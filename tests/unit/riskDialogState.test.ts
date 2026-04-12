import { describe, expect, it } from 'vitest';
import { createInitialRiskDialogState, openRiskDialog, resolveRiskDialog } from '../../shared/domain/riskDialog';
import type { RiskConfirmationRequest } from '../../shared/domain/risk';

const request: RiskConfirmationRequest = {
  confirmationId: 'req-1',
  workspaceId: 'ws-1',
  workspaceName: 'Prod Workspace',
  environmentType: 'prod',
  method: 'DELETE',
  url: 'https://api.example.com/items/1',
  path: '/items/1',
  level: 'warning',
  reasonCode: 'prod-mutating'
};

describe('risk dialog state', () => {
  it('ダイアログ表示条件を満たしたとき開く', () => {
    const initial = createInitialRiskDialogState();
    const opened = openRiskDialog(initial, request);
    expect(opened.isOpen).toBe(true);
    expect(opened.currentRequest?.confirmationId).toBe('req-1');
  });

  it('続行・キャンセルで状態遷移できる', () => {
    const initial = openRiskDialog(createInitialRiskDialogState(), request);
    const confirmed = resolveRiskDialog(initial, 'confirmed');
    expect(confirmed.isOpen).toBe(false);
    expect(confirmed.lastDecision).toBe('confirmed');

    const reopened = openRiskDialog(confirmed, request);
    const canceled = resolveRiskDialog(reopened, 'canceled');
    expect(canceled.isOpen).toBe(false);
    expect(canceled.lastDecision).toBe('canceled');
  });
});
