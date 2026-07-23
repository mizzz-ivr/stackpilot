import { useMemo, useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { createMobileLogActionArtifacts } from '@stackpilot/shared/domain/mobile-log-actions';
import type { NetworkLog } from '@stackpilot/shared/domain/inspector';
import { colors } from '@/theme/colors';

type ActionKey = 'url' | 'json' | 'curl' | 'share';
type Feedback = { kind: 'success' | 'error'; message: string };

interface LogActionBarProps {
  log: NetworkLog;
}

export const LogActionBar = ({ log }: LogActionBarProps) => {
  const artifacts = useMemo(() => createMobileLogActionArtifacts(log), [log]);
  const [busyAction, setBusyAction] = useState<ActionKey>();
  const [feedback, setFeedback] = useState<Feedback>();

  const copyText = async (action: ActionKey, label: string, value: string) => {
    setBusyAction(action);
    setFeedback(undefined);

    try {
      const copied = await Clipboard.setStringAsync(value);
      if (!copied) throw new Error('clipboard_write_failed');
      setFeedback({ kind: 'success', message: `${label}をコピーしました。` });
    } catch {
      setFeedback({ kind: 'error', message: `${label}をコピーできませんでした。` });
    } finally {
      setBusyAction(undefined);
    }
  };

  const shareSummary = async () => {
    setBusyAction('share');
    setFeedback(undefined);

    try {
      const result = await Share.share(
        {
          title: 'Stackpilot通信情報',
          message: artifacts.summary
        },
        {
          dialogTitle: 'Stackpilot通信情報を共有'
        }
      );

      if (result.action === Share.sharedAction) {
        setFeedback({ kind: 'success', message: '通信情報を共有しました。' });
      }
    } catch {
      setFeedback({ kind: 'error', message: '共有画面を開けませんでした。' });
    } finally {
      setBusyAction(undefined);
    }
  };

  return (
    <View
      style={{
        gap: 10,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 14,
        backgroundColor: colors.surface,
        padding: 12,
        borderCurve: 'continuous'
      }}
    >
      <View style={{ gap: 3 }}>
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>調査アクション</Text>
        <Text selectable style={{ color: colors.subtle, fontSize: 11, lineHeight: 17 }}>
          cURLは機密ヘッダーを伏字化し、安全に取得できたRequest bodyだけを含めます。
        </Text>
        {artifacts.redactedHeaderNames.length > 0 ? (
          <Text selectable style={{ color: colors.warning, fontSize: 10, lineHeight: 16 }}>
            伏字ヘッダー: {artifacts.redactedHeaderNames.join(', ')}
          </Text>
        ) : null}
        {artifacts.redactedRequestBodyFieldPaths.length > 0 ? (
          <Text selectable style={{ color: colors.warning, fontSize: 10, lineHeight: 16 }}>
            伏字body項目: {artifacts.redactedRequestBodyFieldPaths.join(', ')}
          </Text>
        ) : null}
        <Text selectable style={{ color: colors.subtle, fontSize: 10, lineHeight: 16 }}>
          {artifacts.requestBodyNote}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <ActionButton
          label="URLをコピー"
          busy={busyAction === 'url'}
          disabled={Boolean(busyAction)}
          onPress={() => void copyText('url', 'URL', artifacts.url)}
        />
        <ActionButton
          label="JSONをコピー"
          busy={busyAction === 'json'}
          disabled={Boolean(busyAction) || !artifacts.json}
          accessibilityHint={artifacts.json ? '整形済みレスポンスJSONをコピーします' : 'JSONレスポンスがないため利用できません'}
          onPress={() => artifacts.json && void copyText('json', 'JSON', artifacts.json)}
        />
        <ActionButton
          label="cURLをコピー"
          busy={busyAction === 'curl'}
          disabled={Boolean(busyAction)}
          accessibilityHint={artifacts.requestBodyIncluded ? '安全化済みRequest bodyを含むcURLをコピーします' : 'Request bodyを含まないcURLをコピーします'}
          onPress={() => void copyText('curl', 'cURL', artifacts.curl)}
        />
        <ActionButton
          label="共有"
          busy={busyAction === 'share'}
          disabled={Boolean(busyAction)}
          primary
          onPress={() => void shareSummary()}
        />
      </View>

      {!artifacts.json ? (
        <Text selectable style={{ color: colors.subtle, fontSize: 10, lineHeight: 16 }}>
          JSONコピーは、取得済みのResponse bodyが正しいJSONの場合のみ利用できます。
        </Text>
      ) : null}

      {feedback ? (
        <Text
          accessibilityLiveRegion="polite"
          selectable
          style={{
            color: feedback.kind === 'success' ? colors.success : colors.danger,
            fontSize: 11,
            fontWeight: '700'
          }}
        >
          {feedback.message}
        </Text>
      ) : null}
    </View>
  );
};

interface ActionButtonProps {
  label: string;
  busy: boolean;
  disabled: boolean;
  primary?: boolean;
  accessibilityHint?: string;
  onPress: () => void;
}

const ActionButton = ({
  label,
  busy,
  disabled,
  primary = false,
  accessibilityHint,
  onPress
}: ActionButtonProps) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityHint={accessibilityHint}
    accessibilityState={{ disabled, busy }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => ({
      opacity: disabled ? 0.42 : pressed ? 0.72 : 1,
      borderWidth: primary ? 0 : 1,
      borderColor: primary ? 'transparent' : colors.border,
      borderRadius: 10,
      backgroundColor: primary ? colors.accent : colors.surfaceRaised,
      paddingHorizontal: 11,
      paddingVertical: 9,
      borderCurve: 'continuous'
    })}
  >
    <Text style={{ color: primary ? '#ffffff' : colors.text, fontSize: 11, fontWeight: '700' }}>
      {busy ? '処理中…' : label}
    </Text>
  </Pressable>
);
