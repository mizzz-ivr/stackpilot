import type { RiskConfirmationRequest } from './risk';

export type RiskDialogDecision = 'confirmed' | 'canceled';

export interface RiskDialogState {
  isOpen: boolean;
  currentRequest?: RiskConfirmationRequest;
  lastDecision?: RiskDialogDecision;
}

export const createInitialRiskDialogState = (): RiskDialogState => ({
  isOpen: false,
  currentRequest: undefined,
  lastDecision: undefined
});

export const openRiskDialog = (state: RiskDialogState, request: RiskConfirmationRequest): RiskDialogState => {
  if (state.isOpen) return state;
  return {
    isOpen: true,
    currentRequest: request,
    lastDecision: undefined
  };
};

export const resolveRiskDialog = (state: RiskDialogState, decision: RiskDialogDecision): RiskDialogState => ({
  isOpen: false,
  currentRequest: undefined,
  lastDecision: decision
});
