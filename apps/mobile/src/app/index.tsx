import { useState } from 'react';
import { router } from 'expo-router';
import { Text, useWindowDimensions, View } from 'react-native';
import type { NetworkLog } from '@stackpilot/shared/domain/inspector';
import { ConnectionBanner } from '@/components/connection-banner';
import { EnvironmentBadge } from '@/components/environment-badge';
import { LogDetail } from '@/components/log-detail';
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
  const isTablet = width >= tabletBreakpoint;
  const selectedLog = snapshot?.logs.find((log) => log.id === selectedLogId);

  const handleSelect = (log: NetworkLog) => {
    if (isTablet) {
      setSelectedLogId(log.id);
      return;
    }

    router.push({ pathname: '/logs/[id]', params: { id: log.id } });
  };

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
          <View style={{ width: Math.min(400, width * 0.42), borderRightWidth: 1, borderRightColor: colors.border }}>
            <LogList
              logs={snapshot?.logs ?? []}
              selectedLogId={selectedLog?.id}
              refreshing={status === 'loading'}
              onRefresh={() => void reload()}
              onSelect={handleSelect}
            />
          </View>
          <View style={{ flex: 1 }}>
            <LogDetail log={selectedLog} embedded />
          </View>
        </View>
      ) : (
        <LogList
          logs={snapshot?.logs ?? []}
          refreshing={status === 'loading'}
          onRefresh={() => void reload()}
          onSelect={handleSelect}
        />
      )}
    </View>
  );
}
