import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { InspectorProvider } from '@/providers/inspector-provider';
import { colors } from '@/theme/colors';

export default function RootLayout() {
  return (
    <InspectorProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background }
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Stackpilot Inspector' }} />
        <Stack.Screen name="pair" options={{ title: 'Desktopと接続', presentation: 'modal' }} />
        <Stack.Screen name="logs/[id]" options={{ title: '通信詳細', presentation: 'card' }} />
      </Stack>
    </InspectorProvider>
  );
}
