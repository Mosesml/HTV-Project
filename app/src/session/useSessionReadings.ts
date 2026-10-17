import { useEffect, useState } from 'react';

import * as RaveGuard from '../../modules/raveguard-native';
import type { HearingEvent, MotionState, SessionPhaseName } from '../../modules/raveguard-native';
import { errorMessage } from './describe';

// The Active session screen's live readings (K8): hearing from `onHearing`, the motion state
// from `onMotion`, and the next check-in from the snapshot. Kept out of SessionStateProvider
// so 10 Hz motion only re-renders this screen, and only when the state actually changes.

export interface SessionReadings {
  /** Null until the snapshot or the first `onHearing`; its fields are null until BL1 lands. */
  hearing: HearingEvent | null;
  motionState: MotionState | null;
  /** Epoch ms; null in demo mode, outside monitoring, or before the snapshot. */
  nextCheckInAt: number | null;
  /** Set when the snapshot couldn't be read; events may still arrive. */
  readError: string | null;
}

/**
 * `phaseName` is the session phase; the snapshot is read again whenever it changes, since the
 * next check-in is only rescheduled once Swift is back to `monitoring` and `onPhase` doesn't
 * carry it.
 */
export function useSessionReadings(phaseName: SessionPhaseName | null): SessionReadings {
  const [hearing, setHearing] = useState<HearingEvent | null>(null);
  const [motionState, setMotionState] = useState<MotionState | null>(null);
  const [nextCheckInAt, setNextCheckInAt] = useState<number | null>(null);
  const [readError, setReadError] = useState<string | null>(null);

  useEffect(() => {
    const subscriptions = [
      RaveGuard.addListener('onHearing', setHearing),
      // Same state again bails out of the render, so 10 Hz readouts cost nothing here.
      RaveGuard.addListener('onMotion', (motion) => setMotionState(motion.state)),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, []);

  useEffect(() => {
    let isMounted = true;
    RaveGuard.getSnapshot()
      .then((snapshot) => {
        if (!isMounted) return;
        // An onHearing that beat the snapshot is newer, so it wins.
        setHearing((current) => current ?? snapshot.hearing);
        setNextCheckInAt(snapshot.nextCheckInAt);
        setReadError(null);
      })
      .catch((error: unknown) => {
        if (isMounted) setReadError(errorMessage(error));
      });
    return () => {
      isMounted = false;
    };
  }, [phaseName]);

  return { hearing, motionState, nextCheckInAt, readError };
}
