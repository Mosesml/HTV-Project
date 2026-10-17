import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import * as RaveGuard from '../../modules/raveguard-native';
import type { CheckInStage } from '../../modules/raveguard-native';
import { errorMessage, secondsUntil } from '../session/describe';
import { useNow } from '../session/useNow';
import { useSessionState } from '../session/SessionStateProvider';
import { ActionButton } from '../ui/ActionButton';
import { COLORS, SPACING } from '../ui/theme';

// Skeleton (K3), full screen and dark. K7 adds the countdown ring and the one-handed layout.
// It leaves on its own: a nod or Cancel returns to the session, the PIN gate opens PIN entry
// (PhaseNavigator).

const TICK_MS = 1000;

const STAGE_HINTS: Record<CheckInStage, string> = {
  whisper: "Nod if you're okay.",
  loud: 'Nod, or tap Cancel.',
  pinGate: 'Enter your PIN.',
};

export default function CheckInScreen() {
  const { phase } = useSessionState();
  const now = useNow(TICK_MS);
  const [error, setError] = useState<string | null>(null);
  const stage = phase?.phase === 'checkIn' ? phase.stage : null;
  const endsAt = phase?.phase === 'checkIn' ? phase.stageEndsAt : null;

  const handleCancel = () => {
    setError(null);
    RaveGuard.tapCancel().catch((e: unknown) => setError(errorMessage(e)));
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.middle}>
        <Text accessibilityRole="header" style={styles.question}>
          Are you okay?
        </Text>
        {stage && <Text style={styles.hint}>{STAGE_HINTS[stage]}</Text>}
        {endsAt !== null && <Text style={styles.countdown}>{`${secondsUntil(endsAt, now)} s`}</Text>}
        {error && <Text style={styles.error}>{error}</Text>}
      </View>
      <ActionButton label="Cancel" onPress={handleCancel} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: SPACING.gutter,
    gap: SPACING.gap,
    backgroundColor: COLORS.nightBackground,
  },
  middle: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: SPACING.gap },
  question: { fontSize: 40, fontWeight: '700', color: COLORS.nightText, textAlign: 'center' },
  hint: { fontSize: 22, color: COLORS.nightText, textAlign: 'center' },
  countdown: { fontSize: 56, fontWeight: '600', color: COLORS.nightText, fontVariant: ['tabular-nums'] },
  error: { fontSize: 15, color: COLORS.danger },
});
