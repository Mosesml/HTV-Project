import { useState } from 'react';
import { useRouter } from 'expo-router';

import * as RaveGuard from '../../modules/raveguard-native';
import { CheckInView } from '../checkIn/CheckInView';
import { stageCountdown } from '../checkIn/countdown';
import { ROUTES } from '../navigation/phaseNavigation';
import { errorMessage } from '../session/describe';
import { useNow } from '../session/useNow';
import { useSessionState } from '../session/SessionStateProvider';

// Check-in (K7, PRD D8 / UI-3): one screen for the whisper and loud stages, "Are you okay?",
// the countdown ring for the current stage and one 96 pt "I'm okay" under the thumb that calls
// tapCancel. It leaves on its own: a nod or "I'm okay" returns to the session and the PIN
// gate opens PIN entry (PhaseNavigator). The layout lives in src/checkIn/CheckInView.tsx.

/** Four updates a second, so the ring drains smoothly through a 10 s demo stage. */
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
      setError(`Cancel didn't go through (${errorMessage(e)}). Nod twice, or tap I'm okay again.`);
    });
  };

  // PhaseNavigator normally gets here first; this is the wearer's way through if it didn't.
  const handleEnterPin = () => router.replace(ROUTES.pin);

  return (
    <CheckInView
      stage={stage}
      countdown={countdown}
      trigger={phase?.trigger ?? null}
      error={error}
      onCancel={handleCancel}
      onEnterPin={handleEnterPin}
    />
  );
}
