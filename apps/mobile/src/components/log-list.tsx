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
  pinnedLogIds: ReadonlySet<string>;
  refreshing: boolean;
  emptyMessage: string;
  onRefresh: () => void;
  onSelect: (log: NetworkLog) => void;
  onTogglePin: (log: NetworkLog) => void;
}

const statusColorMap = {
  unknown: colors.subtle,
  informational: colors.info,
  success: colors.success,
  redirect: colors.info,
  'client-error': colors.warning,
  'server-error': colors.danger
} as const;

export const LogList = ({
  logs,
  selectedLogId,
  pinnedLogIds,
  refreshing,
  emptyMessage,
  onRefresh,
  onSelect,
  onTogglePin
}: LogListProps) => (
  <FlatList
    data={logs}
    keyExtractor={(item) => item.id}
    contentInsetAdjustmentBehavior="automatic"
    keyboardShouldPersistTaps="handled"
    contentContainerStyle={{ padding: 12, gap: 8, flexGrow: logs.length === 0 ? 1 : undefined }}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    ListEmptyComponent={
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text selectable style={{ color: colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 21 }}>
          {emptyMessage}
        </Text>
      </View>
    }
    renderItem={({ item }) => {
      const selected = item.id === selectedLogId;
      const pinned = pinnedLogIds.has(item.id);
      const statusKind = getStatusKind(item.status);
      const statusColor = statusColorMap[statusKind];

      return (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'stretch',
            borderWidth: 1,
            borderColor: selected ? colors.accent : pinned ? `${colors.warning}80` : colors.border,
            borderRadius: 14,
            backgroundColor: selected ? colors.accentSoft : colors.surface,
            overflow: 'hidden',
            borderCurve: 'continuous'
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${formatMethodLabel(item.method)} ${toPathLabel(item.url)} status ${item.status ?? 'error'}`}
            onPress={() => onSelect(item)}
            style={({ pressed }) => ({
              flex: 1,
              opacity: pressed ? 0.72 : 1,
              padding: 12,
              gap: 8
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text selectable style={{ color: colors.text, fontSize: 12, fontWeight: '800', minWidth: 46 }}>
                {formatMethodLabel(item.method)}
              </Text>
              <Text selectable style={{ color: statusColor, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                {item.status ?? 'ERR'}
              </Text>
              {pinned ? (
                <Text style={{ color: colors.warning, fontSize: 10, fontWeight: '800' }}>固定</Text>
              ) : null}
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

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={pinned ? 'ログの固定を解除' : 'ログを一覧上部へ固定'}
            accessibilityState={{ selected: pinned }}
            onPress={() => onTogglePin(item)}
            style={({ pressed }) => ({
              width: 54,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.72 : 1,
              borderLeftWidth: 1,
              borderLeftColor: pinned ? `${colors.warning}60` : colors.border,
              backgroundColor: pinned ? `${colors.warning}18` : colors.surfaceRaised
            })}
          >
            <Text style={{ color: pinned ? colors.warning : colors.muted, fontSize: 11, fontWeight: '800' }}>
              {pinned ? '解除' : '固定'}
            </Text>
          </Pressable>
        </View>
      );
    }}
  />
);
