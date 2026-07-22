import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import {
  hasActiveMobileLogFilters,
  mobileLogMethodFilters,
  mobileLogStatusFilters,
  type MobileLogFilterState,
  type MobileLogMethodFilter,
  type MobileLogStatusFilter
} from '@stackpilot/shared/domain/mobile-log-filters';
import { colors } from '@/theme/colors';

interface LogFilterBarProps {
  filter: MobileLogFilterState;
  resultCount: number;
  totalCount: number;
  pinnedCount: number;
  onChange: (filter: MobileLogFilterState) => void;
  onClear: () => void;
}

const methodLabels: Record<MobileLogMethodFilter, string> = {
  all: 'すべて',
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PATCH',
  DELETE: 'DELETE',
  other: 'その他'
};

const statusLabels: Record<MobileLogStatusFilter, string> = {
  all: 'すべて',
  success: '2xx',
  redirect: '3xx',
  'client-error': '4xx',
  'server-error': '5xx',
  unknown: 'ERR'
};

export const LogFilterBar = ({
  filter,
  resultCount,
  totalCount,
  pinnedCount,
  onChange,
  onClear
}: LogFilterBarProps) => {
  const hasActiveFilters = hasActiveMobileLogFilters(filter);

  return (
    <View
      style={{
        gap: 10,
        paddingHorizontal: 12,
        paddingTop: 12,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.background
      }}
    >
      <TextInput
        accessibilityLabel="APIログを検索"
        value={filter.query}
        onChangeText={(query) => onChange({ ...filter, query })}
        placeholder="URL・パス・Method・Statusを検索"
        placeholderTextColor={colors.subtle}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        returnKeyType="search"
        style={{
          minHeight: 42,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          backgroundColor: colors.surface,
          color: colors.text,
          paddingHorizontal: 12,
          paddingVertical: 9,
          fontSize: 13
        }}
      />

      <FilterRow label="Method">
        {mobileLogMethodFilters.map((method) => (
          <FilterChip
            key={method}
            label={methodLabels[method]}
            selected={filter.method === method}
            onPress={() => onChange({ ...filter, method })}
          />
        ))}
      </FilterRow>

      <FilterRow label="Status">
        {mobileLogStatusFilters.map((status) => (
          <FilterChip
            key={status}
            label={statusLabels[status]}
            selected={filter.status === status}
            onPress={() => onChange({ ...filter, status })}
          />
        ))}
      </FilterRow>

      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <FilterChip
          label="失敗のみ"
          selected={filter.failuresOnly}
          danger={filter.failuresOnly}
          onPress={() => onChange({ ...filter, failuresOnly: !filter.failuresOnly })}
        />

        <Text selectable style={{ color: colors.muted, fontSize: 11, fontVariant: ['tabular-nums'] }}>
          {resultCount} / {totalCount}件
          {pinnedCount > 0 ? ` · 固定 ${pinnedCount}件` : ''}
        </Text>

        {hasActiveFilters ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="検索条件をすべて解除"
            onPress={onClear}
            style={({ pressed }) => ({
              marginLeft: 'auto',
              opacity: pressed ? 0.7 : 1,
              paddingHorizontal: 8,
              paddingVertical: 6
            })}
          >
            <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '700' }}>条件を解除</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
};

interface FilterRowProps {
  label: string;
  children: ReactNode;
}

const FilterRow = ({ label, children }: FilterRowProps) => (
  <View style={{ gap: 6 }}>
    <Text style={{ color: colors.subtle, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>
      {label}
    </Text>
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: 7 }}
    >
      {children}
    </ScrollView>
  </View>
);

interface FilterChipProps {
  label: string;
  selected: boolean;
  danger?: boolean;
  onPress: () => void;
}

const FilterChip = ({ label, selected, danger = false, onPress }: FilterChipProps) => {
  const accent = danger ? colors.danger : colors.accent;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.72 : 1,
        borderWidth: 1,
        borderColor: selected ? accent : colors.border,
        borderRadius: 999,
        backgroundColor: selected ? `${accent}22` : colors.surface,
        paddingHorizontal: 10,
        paddingVertical: 7
      })}
    >
      <Text style={{ color: selected ? accent : colors.muted, fontSize: 11, fontWeight: '700' }}>
        {label}
      </Text>
    </Pressable>
  );
};
