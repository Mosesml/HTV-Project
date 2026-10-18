import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import * as RaveGuard from '../../modules/raveguard-native';
import { useNoiseState } from '../debug/useNoiseState';
import { ROUTES } from '../navigation/phaseNavigation';
import { usePins } from '../pin/PinStoreProvider';
import { errorMessage } from '../session/describe';
import { useSessionState } from '../session/SessionStateProvider';
import { useSettings } from '../settings/SettingsProvider';
import { airPodsStatus, alertChain, hearingStatus, type StatusLine } from '../setup/homeStatus';
import {
  Card,
  Icon,
  IconButton,
  InfoCallout,
  ListRow,
  PALETTE,
  PrimaryButton,
  Screen,
  SPACE,
  StatusDot,
  TEXT,
  TextButton,
  type IconName,
} from '../ui';

// Home (docs/design/screens/Home.html), shown on `idle` once settings are saved (HomeRoute sends
// a fresh install to Setup step 1). Start session sends the saved settings, then starts; it
// doesn't navigate, because PhaseNavigator opens Active session when Swift reports `monitoring`.
// Settings opens the setup steps on a fresh draft of the saved settings.

const WORDMARK_ICON_SIZE = 26;

type StatusRowProps = {
  icon: IconName;
  iconColor: string;
  title: string;
  status: StatusLine;
  hasDivider?: boolean;
};

function StatusRow({ icon, iconColor, title, status, hasDivider }: StatusRowProps) {
  return (
    <ListRow
      accessibilityLabel={`${title}, ${status.spoken}`}
      hasDivider={hasDivider}
      icon={icon}
      iconColor={iconColor}
      subtitle={status.text}
      title={title}
      trailing={status.dot === null ? undefined : <StatusDot tone={status.dot} />}
    />
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { settings } = useSettings();
  const { hasPins, isLoaded: arePinsLoaded } = usePins();
  const { phase, airPodsConnected } = useSessionState();
  const noise = useNoiseState();
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const isRunning = phase !== null && phase.phase !== 'idle';

  const handleStart = async () => {
    setError(null);
    if (isRunning) {
      router.push(ROUTES.session);
      return;
    }
    setIsStarting(true);
    try {
      // Settings go down right before a start, so a fresh launch never runs on stale ones.
      await RaveGuard.configure(settings);
      await RaveGuard.startSession();
    } catch (e: unknown) {
      setError(`Couldn't start the session (${errorMessage(e)}). Try again.`);
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <Screen
      gap={SPACE.xxl}
      footer={
        <View style={styles.footer}>
          <PrimaryButton
            icon="shield"
            isDisabled={isStarting}
            label={isRunning ? 'Open session' : 'Start session'}
            onPress={handleStart}
            size="large"
          />
          <TextButton label="Debug panel" onPress={() => router.push(ROUTES.debug)} />
        </View>
      }>
      <View style={styles.header}>
        <View style={styles.brand}>
          <Icon color={PALETTE.lavender} name="shieldCheck" size={WORDMARK_ICON_SIZE} />
          <Text accessibilityRole="header" style={TEXT.titleSmall}>RaveGuard</Text>
        </View>
        <IconButton
          accessibilityHint={isRunning ? 'Stop the session to change settings' : 'Edit contacts, session settings and PINs'}
          accessibilityLabel="Settings"
          icon="sliders"
          isDisabled={isRunning}
          onPress={() => router.push(ROUTES.setupContacts)}
        />
      </View>
      <Card padding="list">
        <StatusRow icon="headphones" iconColor={PALETTE.blue} status={airPodsStatus(airPodsConnected)} title="AirPods" />
        <ListRow
          icon="clock"
          subtitle="Whispered in your ear. Nod twice to answer."
          title={`Check-ins every ${settings.intervalMin} min`}
        />
        <ListRow icon="people" subtitle={alertChain(settings.recipients)} title="Alert chain" />
        <StatusRow hasDivider={false} icon="soundBars" iconColor={PALETTE.blue} status={hearingStatus(noise)} title="Hearing protection" />
      </Card>
      {arePinsLoaded && !hasPins && (
        <InfoCallout icon="lock" tone="warning">
          Set your PINs in Settings to finish setup.
        </InfoCallout>
      )}
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
  brand: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  footer: { gap: SPACE.md, alignItems: 'stretch' },
});
