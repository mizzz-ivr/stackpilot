import type { EnvironmentType } from './environment';
import { isProdEnvironment } from './environment';

export type SafetyLevel = 'normal' | 'warning' | 'danger';

export const getSafetyLevelByEnvironment = (environmentType: EnvironmentType): SafetyLevel => {
  if (isProdEnvironment(environmentType)) return 'danger';
  if (environmentType === 'stg') return 'warning';
  return 'normal';
};

export const safetyDialogMessage: Record<SafetyLevel, string> = {
  normal: 'この操作を実行します。',
  warning: 'この操作は検証環境に影響する可能性があります。',
  danger: 'この操作は本番環境に影響する可能性があります。実行前に再確認してください。'
};
