import { ScrollView, Text, View } from 'react-native';
import {
  createPayloadPreview,
  formatDurationLabel,
  formatMethodLabel,
  formatStartedAtLabel,
  getStatusKind,
  toHeaderEntries,
  type HeaderEntry,
  type NetworkLog
} from '@stackpilot/shared/domain/inspector';
import {
  formatRequestBodyUnavailableReason,
  type SafeRequestBodyPreview
} from '@stackpilot/shared/domain/request-body';
import { LogActionBar } from '@/components/log-action-bar';
import { colors } from '@/theme/colors';

interface HeaderSectionProps {
  title: string;
  entries: HeaderEntry[];
}

const HeaderSection = ({ title, entries }: HeaderSectionProps) => (
  <View style={{ gap: 8 }}>
    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>{title}</Text>
    {entries.length === 0 ? (
      <Text selectable style={{ color: colors.subtle, fontSize: 12 }}>
        取得されていません。
      </Text>
    ) : (
      <View style={{ gap: 8 }}>
        {entries.map((entry) => (
          <View
            key={entry.name}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              backgroundColor: colors.surface,
              padding: 10,
              gap: 4,
              borderCurve: 'continuous'
            }}
          >
            <Text selectable style={{ color: colors.muted, fontSize: 11, fontWeight: '700' }}>
              {entry.name}
            </Text>
            <Text selectable style={{ color: colors.text, fontSize: 12, lineHeight: 18 }}>
              {entry.value}
            </Text>
          </View>
        ))}
      </View>
    )}
  </View>
);

const RequestBodySection = ({ requestBody }: { requestBody?: SafeRequestBodyPreview }) => {
  const preview = createPayloadPreview(requestBody?.content);
  const isUnavailable = !requestBody || requestBody.kind === 'unavailable';

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>Request body preview</Text>
        {requestBody ? (
          <Text selectable style={{ color: colors.subtle, fontSize: 11 }}>
            {requestBody.kind.toUpperCase()} · {requestBody.byteLength} bytes
          </Text>
        ) : null}
      </View>

      <View
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 14,
          backgroundColor: colors.surface,
          padding: 12,
          gap: 8,
          borderCurve: 'continuous'
        }}
      >
        {isUnavailable ? (
          <Text selectable style={{ color: colors.subtle, fontSize: 12, lineHeight: 18 }}>
            {formatRequestBodyUnavailableReason(requestBody?.unavailableReason)}
          </Text>
        ) : (
          <Text
            selectable
            style={{ color: colors.text, fontSize: 12, lineHeight: 18, fontFamily: 'monospace' }}
          >
            {preview.content}
          </Text>
        )}

        {requestBody?.contentType ? (
          <Text selectable style={{ color: colors.subtle, fontSize: 10 }}>
            Content-Type: {requestBody.contentType}
          </Text>
        ) : null}
        {requestBody?.redactedFieldPaths.length ? (
          <Text selectable style={{ color: colors.warning, fontSize: 10, lineHeight: 16 }}>
            伏字項目: {requestBody.redactedFieldPaths.join(', ')}
          </Text>
        ) : null}
      </View>
    </View>
  );
};

interface LogDetailProps {
  log?: NetworkLog;
  embedded?: boolean;
}

const statusColorMap = {
  unknown: colors.subtle,
  informational: colors.info,
  success: colors.success,
  redirect: colors.info,
  'client-error': colors.warning,
  'server-error': colors.danger
} as const;

export const LogDetail = ({ log, embedded = false }: LogDetailProps) => {
  if (!log) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.background }}>
        <Text selectable style={{ color: colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 21 }}>
          左側の一覧から通信を選択すると、Request / Responseの詳細を確認できます。
        </Text>
      </View>
    );
  }

  const requestHeaders = toHeaderEntries(log.requestHeaders);
  const responseHeaders = toHeaderEntries(log.responseHeaders);
  const payload = createPayloadPreview(log.responseBodySnippet);
  const statusColor = statusColorMap[getStatusKind(log.status)];

  return (
    <ScrollView
      contentInsetAdjustmentBehavior={embedded ? 'never' : 'automatic'}
      contentContainerStyle={{ padding: 16, gap: 22 }}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <View style={{ borderRadius: 8, backgroundColor: colors.surfaceRaised, paddingHorizontal: 9, paddingVertical: 6 }}>
            <Text selectable style={{ color: colors.text, fontSize: 12, fontWeight: '800' }}>
              {formatMethodLabel(log.method)}
            </Text>
          </View>
          <Text selectable style={{ color: statusColor, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
            {log.status ?? '通信エラー'}
          </Text>
          <Text selectable style={{ color: colors.muted, fontSize: 12, fontVariant: ['tabular-nums'] }}>
            {formatDurationLabel(log.durationMs)}
          </Text>
          <Text selectable style={{ color: colors.subtle, fontSize: 11 }}>
            {log.resourceType.toUpperCase()}
          </Text>
        </View>
        <Text selectable style={{ color: colors.text, fontSize: 13, lineHeight: 20 }}>
          {log.url}
        </Text>
        <Text selectable style={{ color: colors.subtle, fontSize: 11 }}>
          開始時刻 {formatStartedAtLabel(log.startedAt)}
        </Text>
      </View>

      <LogActionBar log={log} />

      <HeaderSection title="Request headers" entries={requestHeaders} />
      <RequestBodySection requestBody={log.requestBody} />
      <HeaderSection title="Response headers" entries={responseHeaders} />

      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>Response body preview</Text>
          {payload.kind !== 'empty' ? (
            <Text selectable style={{ color: colors.subtle, fontSize: 11 }}>
              {payload.kind === 'json' ? 'JSON' : 'TEXT'}
              {payload.isTruncated ? ' · 先頭のみ' : ''}
            </Text>
          ) : null}
        </View>
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 14,
            backgroundColor: colors.surface,
            padding: 12,
            borderCurve: 'continuous'
          }}
        >
          <Text
            selectable
            style={{
              color: payload.kind === 'empty' ? colors.subtle : colors.text,
              fontSize: 12,
              lineHeight: 18,
              fontFamily: payload.kind === 'empty' ? undefined : 'monospace'
            }}
          >
            {payload.content}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};
