import type { EnvironmentType } from './environment';
import { environmentLabelMap, isProdEnvironment } from './environment';

export const dangerousMethods = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;

export type DangerousMethod = (typeof dangerousMethods)[number];
export type WarningLevel = 'none' | 'warning' | 'blocking';

export interface RiskEvaluationInput {
  environmentType: EnvironmentType;
  method: string;
  url: string;
  hostname?: string;
}

export interface RiskEvaluationResult {
  level: WarningLevel;
  reasonCode: 'none' | 'prod-mutating';
  isProduction: boolean;
  isMutatingMethod: boolean;
  shouldConfirm: boolean;
}

export interface RiskConfirmationRequest {
  confirmationId: string;
  workspaceId: string;
  workspaceName: string;
  environmentType: EnvironmentType;
  method: string;
  url: string;
  path: string;
  level: Exclude<WarningLevel, 'none'>;
  reasonCode: Exclude<RiskEvaluationResult['reasonCode'], 'none'>;
}

export interface RiskDialogContent {
  title: string;
  summary: string;
  caution: string;
  environmentLabel: string;
  methodLabel: string;
  targetLabel: string;
  continueLabel: string;
  cancelLabel: string;
}

export const isDangerousMethod = (method: string): method is DangerousMethod => {
  return dangerousMethods.includes(method.toUpperCase() as DangerousMethod);
};

export const evaluateRequestRisk = (input: RiskEvaluationInput): RiskEvaluationResult => {
  const isProduction = isProdEnvironment(input.environmentType);
  const isMutatingMethod = isDangerousMethod(input.method);

  if (isProduction && isMutatingMethod) {
    return {
      level: 'warning',
      reasonCode: 'prod-mutating',
      isProduction,
      isMutatingMethod,
      shouldConfirm: true
    };
  }

  return {
    level: 'none',
    reasonCode: 'none',
    isProduction,
    isMutatingMethod,
    shouldConfirm: false
  };
};

export const shouldShowRiskDialog = (result: RiskEvaluationResult): boolean => result.level !== 'none';

export const toRequestPath = (url: string): string => {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
};

export const buildRiskDialogContent = (request: RiskConfirmationRequest): RiskDialogContent => ({
  title: request.level === 'blocking' ? '本番環境で操作をブロックしました' : '本番環境で危険操作を検知しました',
  summary: 'この操作は本番環境データへ影響する可能性があります。実行前に内容を再確認してください。',
  caution: '意図した操作であることを確認できる場合のみ「続行」を選択してください。',
  environmentLabel: environmentLabelMap[request.environmentType],
  methodLabel: request.method.toUpperCase(),
  targetLabel: request.path,
  continueLabel: request.level === 'blocking' ? '閉じる' : '続行',
  cancelLabel: 'キャンセル'
});
