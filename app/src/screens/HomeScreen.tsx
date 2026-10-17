import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import * as RaveGuard from '../../modules/raveguard-native';
import { ROUTES } from '../navigation/phaseNavigation';
import { errorMessage } from '../session/describe';
import { useSessionState } from '../session/SessionStateProvider';
import { useSettings } from '../settings/SettingsProvider';
import { Card, Icon, IconButton, ListRow, PALETTE, PrimaryButton, Screen, StatusDot, TEXT, TextButton } from '../ui';

// Home (docs/design/screens/Home.html), shown on `idle` once settings are saved (HomeRoute
// sends a fresh install to Setup step 1). PLACEHOLDER from the UI foundation: the setup-home
// group finishes it. Start session sends the saved settings, then starts; it doesn't navigate,
// because PhaseNavigator opens Active session when Swift reports `monitoring`.

function airPodsLine(connected: boolean | null): string {
  if (connected === null) return 'Checked when the session starts';
  return connected ? 'Connected · head motion streaming' : 'Not connected';
}

export default function HomeScreen() {
  const router = useRouter();
  const { settings } = useSettings();
  const { phase, airPodsConnected } = useSessionState();
  const [error, setError] = useState<string | null>(null);
  const isRunning = phase !== null && phase.phase !== 'idle';
  const chain = settings.recipients.map((recipient) => recipient.name.split(' ')[0]).join(' → ');

  const handleStart = async () => {
    setError(null);
    if (isRunning) {
      router.push(ROUTES.session);
      return;
    }
    try {
      await RaveGuard.configure(settings);
      await RaveGuard.startSession();
    } catch (e: unknown) {
      setError(`Couldn't start the session (${errorMessage(e)}). Try again.`);
    }
  };

  return (
    <Screen
      gap={28}
      footer={
        <View style={styles.footer}>
          <PrimaryButton label={isRunning ? 'Open session' : 'Start session'} icon="shield" size="large" onPress={handleStart} />
          <Text style={[TEXT.caption, styles.centered]}>Only starts when you tap. Stop any time.</Text>
          <TextButton label="Debug panel" onPress={() => router.push(ROUTES.debug)} />
        </View>
      }>
      <View style={styles.header}>
        <View style={styles.brand}>
          <Icon name="shieldCheck" size={26} color={PALETTE.lavender} />
          <Text style={TEXT.titleSmall}>RaveGuard</Text>
        </View>
        <IconButton icon="sliders" accessibilityLabel="Settings" onPress={() => router.push(ROUTES.setupContacts)} />
      </View>
      <View style={styles.greeting}>
        <Text style={TEXT.bodyStrong}>{`Tonight, ${settings.wearerName}`}</Text>
        <Text accessibilityRole="header" style={TEXT.titleLarge}>
          Ready when you are.
        </Text>
      </View>
      <Card padding="list">
        <ListRow
          icon="headphones"
          iconColor={PALETTE.blue}
          title="AirPods"
          subtitle={airPodsLine(airPodsConnected)}
          trailing={airPodsConnected === null ? undefined : <StatusDot tone={airPodsConnected ? 'ok' : 'off'} />}
        />
        <ListRow icon="clock" title={`Check-ins every ${settings.intervalMin} min`} subtitle="Whispered in your ear. Nod to answer." />
        <ListRow icon="people" title="Alert chain" subtitle={chain === '' ? 'Nobody yet' : chain} hasDivider={false} />
      </Card>
      {error !== null && (
        <Text accessibilityRole="alert" style={TEXT.error}>
          {error}
        </Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  greeting: { gap: 8 },
  footer: { gap: 14, alignItems: 'stretch' },
  centered: { textAlign: 'center' },
});
