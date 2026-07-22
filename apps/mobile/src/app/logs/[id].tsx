import { Stack, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { LogDetail } from '@/components/log-detail';
import { useInspector } from '@/providers/inspector-provider';
import { colors } from '@/theme/colors';

export default function LogDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const { snapshot, status, errorMessage } = useInspector();
  const logId = Array.isArray(params.id) ? params.id[0] : params.id;
  const log = snapshot?.logs.find((item) => item.id === logId);

  if (!log && status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: 24 }}>
        <Text selectable style={{ color: colors.muted, fontSize: 14 }}>通信詳細を読み込んでいます。</Text>
      </View>
    );
  }

  if (!log) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: 24, gap: 8 }}>
        <Stack.Screen options={{ title: '通信詳細' }} />
        <Text selectable style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>通信が見つかりません</Text>
        <Text selectable style={{ color: colors.muted, fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
          {errorMessage ?? '一覧へ戻り、最新のログを再読み込みしてください。'}
        </Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: `${log.method.toUpperCase()} ${log.status ?? 'ERR'}` }} />
      <LogDetail log={log} />
    </>
  );
}
