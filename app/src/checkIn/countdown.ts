import { secondsUntil } from '../session/describe';

// The Check-in countdown (K7), pure so the maths is unit tested on its own.
//
// `onPhase` carries only the stage's end (`stageEndsAt`, epoch ms). The ring's full length
// is measured from when the app first saw the stage (`phaseSeenAt`, stamped by
// SessionStateProvider), so a relaunch mid-stage starts the ring full for the time left.

/** Ticks around the ring: one a second for a 60 s stage, and a smooth drain for 10 s ones. */
export const RING_TICKS = 60;

export interface StageCountdown {
  /** Whole seconds left, rounded up and never negative. */
  secondsLeft: number;
  /** Share of the stage left, 1 (just started) to 0 (over). */
  fraction: number;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** The countdown for a stage ending at `endsAt` and first seen at `startedAt` (null if unknown). */
export function stageCountdown(endsAt: number, startedAt: number | null, now: number): StageCountdown {
  const remainingMs = endsAt - now;
  const secondsLeft = secondsUntil(endsAt, now);
  if (remainingMs <= 0) return { secondsLeft, fraction: 0 };

  const totalMs = startedAt === null ? 0 : endsAt - startedAt;
  // Unknown or zero length: show what is left as a full ring rather than guess.
  if (totalMs <= 0) return { secondsLeft, fraction: 1 };
  return { secondsLeft, fraction: clampUnit(remainingMs / totalMs) };
}

/** How many of `ticks` to light for `fraction` left; one stays lit while any time is left. */
export function litTicks(fraction: number, ticks: number = RING_TICKS): number {
  return Math.ceil(clampUnit(fraction) * ticks);
}
