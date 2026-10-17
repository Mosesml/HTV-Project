import type { SessionPhaseName } from '../../modules/raveguard-native';

// When the session started, for the "Session live" pill (docs/design/screens/Active.html).
// Swift doesn't send a start time, so the app counts from the moment it first sees the session
// running. This is display only: the session itself (and its check-ins) stays in Swift.

/** The session start after the phase `phaseName` arrives at `now`; null once the session has stopped. */
export function nextSessionStart(current: number | null, phaseName: SessionPhaseName, now: number): number | null {
  if (phaseName === 'idle') return null;
  return current ?? now;
}
