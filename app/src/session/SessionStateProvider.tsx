import { createContext, use, useEffect, useState, type ReactNode } from 'react';

import * as RaveGuard from '../../modules/raveguard-native';
import type { EscalationEvent, PhaseEvent } from '../../modules/raveguard-native';
import { errorMessage } from './describe';

// One subscription to the native module's session state for the whole app: the snapshot on
// mount (a relaunch, or the app coming back from a locked phone), then onPhase and
// onEscalation. Motion (10 Hz) stays out of here so it doesn't re-render every screen.

export interface SessionState {
  /** Null until the first snapshot or event arrives. */
  phase: PhaseEvent | null;
  /** The escalation the wearer may see. Swift never sends one for a duress PIN. */
  escalation: EscalationEvent | null;
  /** Set when the first snapshot failed; events may still arrive. */
  snapshotError: string | null;
}

const INITIAL_STATE: SessionState = { phase: null, escalation: null, snapshotError: null };

const SessionStateContext = createContext<SessionState>(INITIAL_STATE);

type Props = {
  children: ReactNode;
};

export function SessionStateProvider({ children }: Props) {
  const [phase, setPhase] = useState<PhaseEvent | null>(null);
  const [escalation, setEscalation] = useState<EscalationEvent | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const handlePhase = (event: PhaseEvent) => {
      setPhase(event);
      // A new check-in starts with a clean Alert screen.
      if (event.phase === 'checkIn') setEscalation(null);
    };
    const subscriptions = [
      RaveGuard.addListener('onPhase', handlePhase),
      RaveGuard.addListener('onEscalation', setEscalation),
    ];
    RaveGuard.getSnapshot()
      .then((snapshot) => {
        if (!isMounted) return;
        // An event that beat the snapshot here is newer, so it wins.
        setPhase((current) => current ?? snapshot.phase);
        setEscalation((current) => current ?? snapshot.escalation);
      })
      .catch((error: unknown) => {
        if (isMounted) setSnapshotError(errorMessage(error));
      });
    return () => {
      isMounted = false;
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, []);

  const value: SessionState = { phase, escalation, snapshotError };
  return <SessionStateContext value={value}>{children}</SessionStateContext>;
}

export function useSessionState(): SessionState {
  return use(SessionStateContext);
}
