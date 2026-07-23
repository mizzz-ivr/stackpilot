import { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Text, useWindowDimensions, View } from 'react-native';
import type { NetworkLog } from '@stackpilot/shared/domain/inspector';
import {
  defaultMobileLogFilterState,
  filterAndSortMobileLogs,
  hasActiveMobileLogFilters,
  type MobileLogFilterState
} from '@stackpilot/shared/domain/mobile-log-filters';
import { ConnectionBanner } from '@/components/connection-banner';
import { EnvironmentBadge } from '@/components/environment-badge';
import { LogDetail } from '@/components/log-detail';
import { LogFilterBar } from '@/components/log-filter-bar';
import { LogList } from '@/components/log-list';
import { useInspector } from '@/providers/inspector-provider';
import { colors } from '@/theme/colors';

const tabletBreakpoint = 768;

export default function InspectorHomeScreen() {
  const { width } = useWindowDimensions();
  const {
    snapshot,
    status,
    connectionMode,
    errorMessage,
    hasPairing,
    autoRefreshState,
    nextRefreshDelayMs,
    lastCheckedAt,
    lastUpdatedAt,
    reload,
    disconnect
  } = useInspector();
  const [selectedLogId, setSelectedLogId] = useState<string>();
  const [filter, setFilter] = useState<MobileLogFilterState>({ ...defaultMobileLogFilterState });
  const [pinnedLogIds, setPinnedLogIds] = useState<Set<string>>(() => new Set());
  const isTablet = width >= tabletBreakpoint;
  const allLogs = snapshot?.logs ?? [];
  const visibleLogs = useMemo(
    () => filterAndSortMobileLogs(allLogs, filter, pinnedLogIds),
    [allLogs, filter, pinnedLogIds]
  );
  const selectedLog = allLogs.find((log) => log.id === selectedLogId);
  const pinnedCount = allLogs.reduce(
    (count, log) => count + (pinnedLogIds.has(log.id) ? 1 : 0),
    0
  );
  const hasActiveFilters = hasActiveMobileLogFilters(filter);
  const emptyMessage =
    allLogs.length === 0
      ? 'APIログはまだありません。Desktop側で通信を発生させると自動的に表示されます。'
      : hasActiveFilters
        ? '条件に一致するAPIログはありません。検索条件を変更するか解除してください。'
        : '表示できるAPIログがありません。';

  useEffect(() => {
    setSelectedLogId(undefined);
    setFilter({ ...defaultMobileLogFilterState });
    setPinnedLogIds(new Set());
  }, [snapshot?.workspace.id]);

  const handleSelect = (log: NetworkLog) => {
    if (isTablet) {
      setSelectedLogId(log.id);
      return;
    }

    router.push({ pathname: '/logs/[id]', params: { id: log.id } });
  };

  const handleTogglePin = (log: NetworkLog) => {
    setPinnedLogIds((current) => {
      const next = new Set(current);
      if (next.has(log.id)) {
        next.delete(log.id);
      } else {
        next.add(log.id);
      }
      return next;
    });
  };

  const logPanel = (
    <View style={{ flex: 1 }}>
      <LogFilterBar
        filter={filter}
        resultCount={visibleLogs.length}
        totalCount={allLogs.length}
        pinnedCount={pinnedCount}
        onChange={setFilter}
        onClear={() => setFilter({ ...defaultMobileLogFilterState })}
      />
      <LogList
        logs={visibleLogs}
        selectedLogId={selectedLog?.id}
        pinnedLogIds={pinnedLogIds}
        refreshing={status === 'loading'}
        emptyMessage={emptyMessage}
        onRefresh={() => void reload()}
        onSelect={handleSelect}
        onTogglePin={handleTogglePin}
      />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: 14, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <ConnectionBanner
          mode={connectionMode}
          status={status}
          errorMessage={errorMessage}
          hasPairing={hasPairing}
          autoRefreshState={autoRefreshState}
          nextRefreshDelayMs={nextRefreshDelayMs}
          lastCheckedAt={lastCheckedAt}
          lastUpdatedAt={lastUpdatedAt}
          onReload={() => void reload()}
          onPair={() => router.push('/pair')}
          onDisconnect={() => void disconnect()}
        />

        {snapshot ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text selectable style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>
                {snapshot.workspace.name}
              </Text>
              <Text selectable style={{ color: colors.muted, fontSize: 12 }}>
                {snapshot.logs.length} requests · {new Date(snapshot.capturedAt).toLocaleTimeString('ja-JP')}
              </Text>
            </View>
            <EnvironmentBadge
              environmentType={snapshot.workspace.environmentType}
              customLabel={snapshot.workspace.customEnvironmentLabel}
            />
          </View>
        ) : null}
      </View>

      {isTablet ? (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View style={{ width: Math.min(430, width * 0.46), borderRightWidth: 1, borderRightColor: colors.border }}>
            {logPanel}
          </View>
          <View style={{ flex: 1 }}>
            <LogDetail log={selectedLog} embedded />
          </View>
        </View>
      ) : (
        logPanel
      )}
    </View>
  );
}
