import type { PhaseEvent } from '../../modules/raveguard-native';

// The latest phase and when the app first saw that step (K7). The Check-in ring needs the
// stage's length, and `onPhase` only says when the stage ends, so SessionStateProvider stamps
// each new step on arrival. A repeat of the same step (the snapshot racing an event, or
// Swift re-sending) keeps the first stamp, so the ring doesn't jump back to full.

export interface SeenPhase {
  event: PhaseEvent;
  /** Epoch ms when this phase, stage and stage end were first seen. */
  seenAt: number;
}

function isSameStep(a: PhaseEvent, b: PhaseEvent): boolean {
  return a.phase === b.phase && a.stage === b.stage && a.stageEndsAt === b.stageEndsAt;
}

/** The state after `event` arrives at `now`. */
export function seePhase(current: SeenPhase | null, event: PhaseEvent, now: number): SeenPhase {
  if (current !== null && isSameStep(current.event, event)) return { event, seenAt: current.seenAt };
  return { event, seenAt: now };
}
