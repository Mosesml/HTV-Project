import type { SegmentOption } from '../ui';

// The Debug panel's Timings segments (Debug.html). The seconds mirror Swift's SessionTimings
// (modules/raveguard-native/ios/Session/SessionManagerConfig.swift): keep them in step.
// The server opens SOS once the three stages have run out and three recipients have each had
// their acknowledgement window.

export interface LadderTimings {
  whisper: number;
  loud: number;
  pinGate: number;
  ackWindow: number;
}

export const DEMO_TIMINGS: LadderTimings = { whisper: 10, loud: 10, pinGate: 15, ackWindow: 20 };
export const REAL_TIMINGS: LadderTimings = { whisper: 20, loud: 20, pinGate: 30, ackWindow: 120 };

/** Contact 1, Contact 2 and venue staff each get one acknowledgement window. */
const ACK_WINDOWS_BEFORE_SOS = 3;
const SECONDS_PER_MINUTE = 60;

/** Seconds from the check-in opening to the SOS screen (Swift's `sosAfter`). */
export function secondsToSos(timings: LadderTimings): number {
  return timings.whisper + timings.loud + timings.pinGate + ACK_WINDOWS_BEFORE_SOS * timings.ackWindow;
}

export type TimingsChoice = 'demo' | 'real';

const DEMO_SECONDS = secondsToSos(DEMO_TIMINGS);
const REAL_MINUTES = Math.round(secondsToSos(REAL_TIMINGS) / SECONDS_PER_MINUTE);

export const TIMING_OPTIONS: readonly SegmentOption<TimingsChoice>[] = [
  { value: 'demo', label: `Demo · ${DEMO_SECONDS} s to SOS`, accessibilityLabel: `Demo timings, ${DEMO_SECONDS} seconds to SOS` },
  { value: 'real', label: `Real · ${REAL_MINUTES} min`, accessibilityLabel: `Real timings, about ${REAL_MINUTES} minutes to SOS` },
];

export const DEMO_HINT =
  'Demo: 10 s stages and a 15 s PIN gate, check-ins only from the scenario buttons, Call rings the teammate.';
export const REAL_HINT = 'Real timings: full-length stages and a check-in every interval. Call is off.';
