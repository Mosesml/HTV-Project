import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import * as RaveGuard from '../../modules/raveguard-native';
import { CheckInView } from '../checkIn/CheckInView';
import { stageCountdown } from '../checkIn/countdown';
import { ROUTES } from '../navigation/phaseNavigation';
import { errorMessage } from '../session/describe';
import { useNow } from '../session/useNow';
import { useSessionState } from '../session/SessionStateProvider';
import { COLORS } from '../ui/theme';

// Check-in (K7, PRD D8 / UI-3): full screen and dark, "Are you okay?", a countdown ring for
// the current stage and one big Cancel under the thumb that calls tapCancel. It leaves on its
// own: a nod or Cancel returns to the session and the PIN gate opens PIN entry
// (PhaseNavigator). The layout lives in src/checkIn/CheckInView.tsx.

/** Four ticks a second, so the 60-tick ring drains smoothly through a 10 s demo stage. */
const RING_TICK_MS = 250;

export default function CheckInScreen() {
  const { phase, phaseSeenAt } = useSessionState();
  const router = useRouter();
  const now = useNow(RING_TICK_MS);
  const [error, setError] = useState<string | null>(null);
  const isCheckIn = phase?.phase === 'checkIn';
  const stage = isCheckIn ? phase.stage : null;
  const endsAt = isCheckIn ? phase.stageEndsAt : null;
  const countdown = endsAt === null ? null : stageCountdown(endsAt, phaseSeenAt, now);

  const handleCancel = () => {
    setError(null);
    RaveGuard.tapCancel().catch((e: unknown) => {
      setError(`Cancel didn't go through (${errorMessage(e)}). Nod, or tap Cancel again.`);
    });
  };

  // PhaseNavigator normally gets here first; this is the wearer's way through if it didn't.
  const handleEnterPin = () => router.replace(ROUTES.pin);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <CheckInView
        stage={stage}
        countdown={countdown}
        error={error}
        onCancel={handleCancel}
        onEnterPin={handleEnterPin}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.nightBackground },
});
