import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

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
// screen their phase calls for (src/navigation/phaseNavigation.ts). Check-in, Alert and SOS
// can't be swiped away: the session decides when they close.
//
// The splash screen stays up until the fonts (Sora, Manrope, JetBrains Mono) are loaded, or
// failed to load, in which case the app carries on in the system font.

// Fails only when the splash screen is already gone (a fast refresh); nothing to do then.
SplashScreen.preventAutoHideAsync().catch(() => {});

const LOCKED = { gestureEnabled: false } as const;

export default function RootLayout() {
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
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" options={{ title: 'Home' }} />
            <Stack.Screen name="setup/contacts" options={{ title: 'Who gets the alert?' }} />
            <Stack.Screen name="setup/permissions" options={{ title: 'What each person sees' }} />
            <Stack.Screen name="setup/session" options={{ title: 'Your night' }} />
            <Stack.Screen name="setup/pins" options={{ title: 'Two PINs' }} />
            <Stack.Screen name="setup/index" options={{ title: 'Setup (one page)' }} />
            <Stack.Screen name="session" options={{ title: 'Session' }} />
            <Stack.Screen name="check-in" options={{ ...LOCKED, title: 'Check-in' }} />
            <Stack.Screen name="pin" options={{ title: 'PIN' }} />
            <Stack.Screen name="alert" options={{ ...LOCKED, title: 'Alert' }} />
            <Stack.Screen name="sos" options={{ ...LOCKED, title: 'SOS' }} />
            <Stack.Screen name="debug" options={{ title: 'Debug' }} />
          </Stack>
        </SessionStateProvider>
      </PinStoreProvider>
    </SettingsProvider>
  );
}
