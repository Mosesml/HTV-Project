import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import * as RaveGuard from '../../modules/raveguard-native';
import { AirPodsConnectionAlerts } from '../airpods/AirPodsConnectionAlerts';
import { PhaseNavigator } from '../navigation/PhaseNavigator';
import { PinStoreProvider } from '../pin/PinStoreProvider';
import { SessionStateProvider } from '../session/SessionStateProvider';
import { SettingsProvider } from '../settings/SettingsProvider';
import { useAppFonts } from '../ui/fonts';

// The navigation shell (K3, redesigned): one stack holding every screen, with no navigation
// header (each redesigned screen draws its own Back, Settings or Debug button; iOS's edge
// swipe still goes back where a gesture is allowed). SettingsProvider holds the saved
// settings (K4); PinStoreProvider says whether both PINs are set (K5, stored by K6);
// SessionStateProvider follows the native session; PhaseNavigator moves the wearer to the
// screen their phase calls for (src/navigation/phaseNavigation.ts); AirPodsConnectionAlerts
// shows the AirPods connected, disconnected and no-motion dialogs. Check-in, the PIN gate,
// Alert and SOS can't be swiped away: the session decides when they close. The PIN gate draws
// its own Back when opened from Alert or SOS, and Cancelled has "Back to my session"; the lock
// is a fixed screen option, so it is the same for the safe and the duress PIN.
//
// The splash screen stays up until the fonts (Sora, Manrope, JetBrains Mono) are loaded, or
// failed to load, in which case the app carries on in the system font. Shortcuts' raveguard://
// callbacks go straight to Swift (src/app/+native-intent.tsx keeps them off the route stack).

// Fails only when the splash screen is already gone (a fast refresh); nothing to do then.
SplashScreen.preventAutoHideAsync().catch(() => {});

const LOCKED = { gestureEnabled: false } as const;

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

  const { isReady, error } = useAppFonts();

  useEffect(() => {
    if (error) console.warn(`RaveGuard: fonts failed to load, using the system font (${error.message})`);
  }, [error]);

  useEffect(() => {
    if (isReady) SplashScreen.hideAsync().catch(() => {});
  }, [isReady]);

  if (!isReady) return null;

  return (
    <SettingsProvider>
      <PinStoreProvider>
        <SessionStateProvider>
          <PhaseNavigator />
          <AirPodsConnectionAlerts />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" options={{ title: 'Home' }} />
            <Stack.Screen name="setup/contacts" options={{ title: 'Who gets the alert?' }} />
            <Stack.Screen name="setup/permissions" options={{ title: 'What each person sees' }} />
            <Stack.Screen name="setup/session" options={{ title: 'Your night' }} />
            <Stack.Screen name="setup/pins" options={{ title: 'Two PINs' }} />
            <Stack.Screen name="setup/index" options={{ title: 'Setup' }} />
            <Stack.Screen name="session" options={{ title: 'Session' }} />
            <Stack.Screen name="check-in" options={{ ...LOCKED, title: 'Check-in' }} />
            <Stack.Screen name="pin" options={{ ...LOCKED, title: 'PIN' }} />
            <Stack.Screen name="alert" options={{ ...LOCKED, title: 'Alert' }} />
            <Stack.Screen name="sos" options={{ ...LOCKED, title: 'SOS' }} />
            <Stack.Screen name="debug" options={{ title: 'Debug' }} />
          </Stack>
        </SessionStateProvider>
      </PinStoreProvider>
    </SettingsProvider>
  );
}
