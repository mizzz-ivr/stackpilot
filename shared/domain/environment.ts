export const environmentTypes = ['local', 'dev', 'stg', 'prod', 'custom'] as const;

export type EnvironmentType = (typeof environmentTypes)[number];

export const environmentLabelMap: Record<EnvironmentType, string> = {
  local: 'LOCAL',
  dev: 'DEV',
  stg: 'STG',
  prod: 'PROD',
  custom: 'CUSTOM'
};

export type EnvironmentBadgeTone = 'calm' | 'notice' | 'danger' | 'neutral';

export interface EnvironmentBadgeRule {
  tone: EnvironmentBadgeTone;
  className: string;
  dotClassName: string;
}

export const getEnvironmentBadgeRule = (environmentType: EnvironmentType): EnvironmentBadgeRule => {
  switch (environmentType) {
    case 'local':
      return {
        tone: 'calm',
        className: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200',
        dotClassName: 'bg-emerald-400'
      };
    case 'dev':
      return {
        tone: 'calm',
        className: 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200',
        dotClassName: 'bg-cyan-400'
      };
    case 'stg':
      return {
        tone: 'notice',
        className: 'border-amber-500/45 bg-amber-500/15 text-amber-200',
        dotClassName: 'bg-amber-400'
      };
    case 'prod':
      return {
        tone: 'danger',
        className: 'border-rose-500/60 bg-rose-500/20 text-rose-100',
        dotClassName: 'bg-rose-400'
      };
    case 'custom':
      return {
        tone: 'neutral',
        className: 'border-violet-500/40 bg-violet-500/15 text-violet-200',
        dotClassName: 'bg-violet-400'
      };
  }
};

export const isProdEnvironment = (environmentType: EnvironmentType): boolean => environmentType === 'prod';
