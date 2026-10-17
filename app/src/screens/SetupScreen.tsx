import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import * as RaveGuard from '../../modules/raveguard-native';
import { ROUTES } from '../navigation/phaseNavigation';
import { errorMessage } from '../session/describe';
import { useSessionState } from '../session/SessionStateProvider';
import { describeRecipientLine, describeTimings } from '../settings/describeSettings';
import { useSettings } from '../settings/SettingsProvider';
import { ActionButton } from '../ui/ActionButton';
import { LAYOUT, TYPE } from '../ui/theme';

// Skeleton (K3) with the saved settings (K4). The setup flow with both PINs (K5) fills this in.

export default function SetupScreen() {
  const router = useRouter();
  const { phase } = useSessionState();
  const { settings, source, problem, isLoaded } = useSettings();
  const [error, setError] = useState<string | null>(null);
  const isRunning = phase !== null && phase.phase !== 'idle';

  const handleStart = async () => {
    setError(null);
    try {
      if (!isRunning) {
        // Settings go down right before a start, so a fresh launch never runs on stale ones.
        await RaveGuard.configure(settings);
        await RaveGuard.startSession();
      }
      router.push(ROUTES.session);
    } catch (e: unknown) {
      setError(errorMessage(e));
    }
  };

  const startLabel = isRunning ? 'Open session' : 'Start session';

  return (
    <ScrollView contentContainerStyle={LAYOUT.screen}>
      <Text style={TYPE.title}>Set up RaveGuard</Text>
      <Text style={TYPE.body}>
        Editing contacts, permissions, interval, loudness target and your two PINs comes with the setup
        flow (K5). Until then, Debug can save sample settings.
      </Text>
      <View style={styles.summary}>
        <Text style={TYPE.label}>Saved settings</Text>
        {source === 'defaults' && isLoaded && <Text style={TYPE.body}>Not set up yet: using the defaults.</Text>}
        <Text style={TYPE.value}>{`Wearer: ${settings.wearerName}`}</Text>
        <Text style={TYPE.value}>{describeTimings(settings)}</Text>
        {settings.recipients.length === 0 ? (
          <Text style={TYPE.value}>No one to text yet</Text>
        ) : (
          settings.recipients.map((recipient) => (
            <Text key={recipient.id} style={TYPE.value}>
              {describeRecipientLine(recipient)}
            </Text>
          ))
        )}
      </View>
      {problem && <Text style={TYPE.error}>{problem}</Text>}
      {error && <Text style={TYPE.error}>{error}</Text>}
      <ActionButton
        label={isLoaded ? startLabel : 'Loading settings…'}
        isDisabled={!isLoaded}
        onPress={handleStart}
      />
      <ActionButton label="Debug" variant="secondary" onPress={() => router.push(ROUTES.debug)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  summary: { gap: 4, paddingVertical: 8 },
});
