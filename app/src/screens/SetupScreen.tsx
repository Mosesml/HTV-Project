import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useRouter } from 'expo-router';

import * as RaveGuard from '../../modules/raveguard-native';
import { ROUTES } from '../navigation/phaseNavigation';
import { errorMessage } from '../session/describe';
import { PLACEHOLDER_SETTINGS } from '../session/placeholderSettings';
import { useSessionState } from '../session/SessionStateProvider';
import { ActionButton } from '../ui/ActionButton';
import { LAYOUT, TYPE } from '../ui/theme';

// Skeleton (K3). Settings storage (K4) and the setup flow with both PINs (K5) fill this in.

export default function SetupScreen() {
  const router = useRouter();
  const { phase } = useSessionState();
  const [error, setError] = useState<string | null>(null);
  const isRunning = phase !== null && phase.phase !== 'idle';

  const handleStart = async () => {
    setError(null);
    try {
      if (!isRunning) {
        await RaveGuard.configure(PLACEHOLDER_SETTINGS);
        await RaveGuard.startSession();
      }
      router.push(ROUTES.session);
    } catch (e: unknown) {
      setError(errorMessage(e));
    }
  };

  return (
    <ScrollView contentContainerStyle={LAYOUT.screen}>
      <Text style={TYPE.title}>Set up RaveGuard</Text>
      <Text style={TYPE.body}>
        Contacts, permissions, check-in interval, loudness target and your two PINs go here (K4, K5). For
        now the session starts with demo placeholder settings.
      </Text>
      {error && <Text style={TYPE.error}>{error}</Text>}
      <ActionButton label={isRunning ? 'Open session' : 'Start session'} onPress={handleStart} />
      <ActionButton label="Debug" variant="secondary" onPress={() => router.push(ROUTES.debug)} />
    </ScrollView>
  );
}
