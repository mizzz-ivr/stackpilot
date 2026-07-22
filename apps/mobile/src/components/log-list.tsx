import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import {
  formatDurationLabel,
  formatMethodLabel,
  getStatusKind,
  toPathLabel,
  type NetworkLog
} from '@stackpilot/shared/domain/inspector';
import { colors } from '@/theme/colors';

interface LogListProps {
  logs: NetworkLog[];
  selectedLogId?: string;
  refreshing: boolean;
  onRefresh: () => void;
  onSelect: (log: NetworkLog) => void;
}

const statusColorMap = {
  unknown: colors.subtle,
  informational: colors.info,
  success: colors.success,
  redirect: colors.info,
  'client-error': colors.warning,
  'server-error': colors.danger
} as const;

export const LogList = ({ logs, selectedLogId, refreshing, onRefresh, onSelect }: LogListProps) => (
  <FlatList
    data={logs}
    keyExtractor={(item) => item.id}
    contentInsetAdjustmentBehavior="automatic"
    contentContainerStyle={{ padding: 12, gap: 8, flexGrow: logs.length === 0 ? 1 : undefined }}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    ListEmptyComponent={
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text selectable style={{ color: colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 21 }}>
          APIログはまだありません。Desktop側で通信を発生させてから再読み込みしてください。
        </Text>
      </View>
    }
    renderItem={({ item }) => {
      const selected = item.id === selectedLogId;
      const statusKind = getStatusKind(item.status);
      const statusColor = statusColorMap[statusKind];

      return (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected }}
          accessibilityLabel={`${formatMethodLabel(item.method)} ${toPathLabel(item.url)} status ${item.status ?? 'error'}`}
          onPress={() => onSelect(item)}
          style={({ pressed }) => ({
            opacity: pressed ? 0.72 : 1,
            borderWidth: 1,
            borderColor: selected ? colors.accent : colors.border,
            borderRadius: 14,
            backgroundColor: selected ? colors.accentSoft : colors.surface,
            padding: 12,
            gap: 8,
            borderCurve: 'continuous'
          })}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text selectable style={{ color: colors.text, fontSize: 12, fontWeight: '800', minWidth: 46 }}>
              {formatMethodLabel(item.method)}
            </Text>
            <Text selectable style={{ color: statusColor, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
              {item.status ?? 'ERR'}
            </Text>
            <Text selectable style={{ marginLeft: 'auto', color: colors.muted, fontSize: 12, fontVariant: ['tabular-nums'] }}>
              {formatDurationLabel(item.durationMs)}
            </Text>
          </View>
          <Text selectable numberOfLines={2} style={{ color: colors.text, fontSize: 13, lineHeight: 19 }}>
            {toPathLabel(item.url)}
          </Text>
          <Text selectable numberOfLines={1} style={{ color: colors.subtle, fontSize: 11 }}>
            {item.resourceType.toUpperCase()} · {item.url}
          </Text>
        </Pressable>
      );
    }}
  />
);
