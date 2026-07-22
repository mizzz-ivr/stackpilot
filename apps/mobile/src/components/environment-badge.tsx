import { Text, View } from 'react-native';
import {
  environmentLabelMap,
  type EnvironmentType
} from '@stackpilot/shared/domain/environment';
import { colors } from '@/theme/colors';

const environmentColorMap: Record<EnvironmentType, string> = {
  local: colors.success,
  dev: colors.info,
  stg: colors.warning,
  prod: colors.danger,
  custom: colors.accent
};

interface EnvironmentBadgeProps {
  environmentType: EnvironmentType;
  customLabel?: string;
}

export const EnvironmentBadge = ({ environmentType, customLabel }: EnvironmentBadgeProps) => {
  const accent = environmentColorMap[environmentType];
  const label = environmentType === 'custom' && customLabel ? customLabel : environmentLabelMap[environmentType];

  return (
    <View
      accessibilityLabel={`現在の環境: ${label}`}
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderWidth: 1,
        borderColor: accent,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 5,
        backgroundColor: `${accent}1F`
      }}
    >
      <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: accent }} />
      <Text selectable style={{ color: accent, fontSize: 12, fontWeight: '700', letterSpacing: 0.4 }}>
        {label}
      </Text>
    </View>
  );
};
