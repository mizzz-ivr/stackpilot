import { Pressable, Text, View } from 'react-native';
import type { InspectorConnectionMode } from '@/repositories/inspector-repository';
import type { InspectorLoadStatus } from '@/hooks/use-inspector-snapshot';
import { colors } from '@/theme/colors';

interface ConnectionBannerProps {
  mode: InspectorConnectionMode;
  status: InspectorLoadStatus;
  errorMessage?: string;
  onReload: () => void;
}

export const ConnectionBanner = ({ mode, status, errorMessage, onReload }: ConnectionBannerProps) => {
  const isError = status === 'error';
  const title = isError ? '接続エラー' : mode === 'demo' ? 'デモモード' : status === 'loading' ? '接続中' : '接続済み';
  const description = isError
    ? errorMessage ?? 'Inspectorデータを取得できませんでした。'
    : mode === 'demo'
      ? 'EXPO_PUBLIC_STACKPILOT_API_URL未設定のため、サンプル通信を表示しています。'
      : status === 'loading'
        ? 'Stackpilot Desktopから最新ログを取得しています。'
        : 'Stackpilot DesktopのInspector APIに接続しています。';
  const accent = isError ? colors.danger : mode === 'demo' ? colors.warning : colors.success;

  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        borderWidth: 1,
        borderColor: `${accent}80`,
        borderRadius: 14,
        backgroundColor: `${accent}14`,
        padding: 12,
        gap: 8,
        borderCurve: 'continuous'
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text selectable style={{ color: accent, fontSize: 13, fontWeight: '700' }}>
            {title}
          </Text>
          <Text selectable style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
            {description}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Inspectorデータを再読み込み"
          onPress={onReload}
          disabled={status === 'loading'}
          style={({ pressed }) => ({
            opacity: status === 'loading' ? 0.45 : pressed ? 0.7 : 1,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 10,
            paddingHorizontal: 10,
            paddingVertical: 8,
            backgroundColor: colors.surfaceRaised,
            borderCurve: 'continuous'
          })}
        >
          <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>
            {status === 'loading' ? '読込中' : '再読込'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
};
