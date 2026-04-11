import type { EnvironmentType } from '../../shared/domain/environment';
import { environmentLabelMap, getEnvironmentBadgeRule } from '../../shared/domain/environment';

interface Props {
  environmentType: EnvironmentType;
}

export const EnvironmentBadge = ({ environmentType }: Props) => {
  const rule = getEnvironmentBadgeRule(environmentType);

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${rule.className}`}>
      <span className={`h-2 w-2 rounded-full ${rule.dotClassName}`} />
      {environmentLabelMap[environmentType]}
    </span>
  );
};
