import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { Stack } from 'expo-router';

import * as RaveGuard from '../../modules/raveguard-native';
import { PhaseNavigator } from '../navigation/PhaseNavigator';
import { PinStoreProvider } from '../pin/PinStoreProvider';
import { SessionStateProvider } from '../session/SessionStateProvider';
import { SettingsProvider } from '../settings/SettingsProvider';

// The navigation shell (K3): one stack holding all six screens. SettingsProvider holds the
// saved settings (K4); PinStoreProvider says whether both PINs are set (K5, stored by K6);
// SessionStateProvider follows the native session; PhaseNavigator opens
// Check-in, PIN entry and Alert when the phase calls for them. Check-in and Alert can't be
// swiped away: the session decides when they close.

const LOCKED = { gestureEnabled: false, headerBackVisible: false } as const;

export default function RootLayout() {
  useEffect(() => {
    const forwardNoiseURL = (url: string): void => {
      void RaveGuard.handleNoiseCallbackURL(url);
    };
    const subscription = Linking.addEventListener('url', ({ url }) => forwardNoiseURL(url));
    void Linking.getInitialURL().then((url) => {
      if (url) forwardNoiseURL(url);
    });
    return () => subscription.remove();
  }, []);

  return (
    <SettingsProvider>
      <PinStoreProvider>
        <SessionStateProvider>
          <PhaseNavigator />
          <Stack>
            <Stack.Screen name="index" options={{ title: 'Setup' }} />
            <Stack.Screen name="session" options={{ title: 'Session' }} />
            <Stack.Screen name="check-in" options={{ ...LOCKED, title: 'Check-in', headerShown: false }} />
            <Stack.Screen name="pin" options={{ title: 'PIN' }} />
            <Stack.Screen name="alert" options={{ ...LOCKED, title: 'Alert' }} />
            <Stack.Screen name="debug" options={{ title: 'Debug' }} />
          </Stack>
        </SessionStateProvider>
      </PinStoreProvider>
    </SettingsProvider>
  );
}
