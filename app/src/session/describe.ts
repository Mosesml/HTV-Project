import type { CheckInTrigger, MotionEvent, PhaseEvent, SessionPhaseName, TriggerKind } from '../../modules/raveguard-native';

// Plain-text renderings of module state, shared by the screens.

const MS_PER_SECOND = 1000;

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Whole seconds until `endsAt` (epoch ms), rounded up and never negative. */
export function secondsUntil(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / MS_PER_SECOND));
}

const PHASE_LABELS: Record<SessionPhaseName, string> = {
  idle: 'Not running',
  monitoring: 'Monitoring',
  checkIn: 'Check-in open',
  escalated: 'Alert sent',
  sos: 'SOS',
};

/** What the Active session screen shows for the phase. */
export function phaseLabel(phase: PhaseEvent | null): string {
  return phase ? PHASE_LABELS[phase.phase] : 'Connecting…';
}

/** The Debug readout of the raw phase (from the K2 smoke screen). */
export function describePhase(phase: PhaseEvent | null, now: number): string {
  if (!phase) return 'waiting for the module…';
  if (phase.phase !== 'checkIn' || phase.stageEndsAt === null) return phase.phase;
  return `checkIn · ${phase.stage} · ${secondsUntil(phase.stageEndsAt, now)} s left`;
}

export const NO_MOTION_YET = 'no readouts yet (start a session)';

/** An angle from `onMotion`, e.g. "-13.0°". */
export function formatDegrees(degrees: number): string {
  return `${degrees.toFixed(1)}°`;
}

/** Acceleration from `onMotion`, e.g. "0.98 g". */
export function formatG(accelG: number): string {
  return `${accelG.toFixed(2)} g`;
}

export function describeMotion(motion: MotionEvent | null): string {
  if (!motion) return NO_MOTION_YET;
  return `${motion.state} · pitch ${formatDegrees(motion.pitch)} · roll ${formatDegrees(motion.roll)} · ${formatG(motion.accelG)}`;
}

const TRIGGER_TITLES: Record<TriggerKind, string> = {
  scheduled: 'Scheduled check-in',
  fall: 'Looked like a fall',
  stillness: "You've been still for a while",
  manual: 'Check-in',
};

/**
 * What started a check-in, in words: a title ("Looked like a fall") and the detector's reason
 * with a capital ("Spike 3.1 g, head 70° sideways, still 12 s"), or null with no trigger. The
 * copy never claims a diagnosis (docs/design/README.md, rule 2).
 */
export function describeTrigger(trigger: CheckInTrigger | null | undefined): { title: string; detail: string } | null {
  if (!trigger) return null;
  const reason = trigger.reason.trim();
  return {
    title: TRIGGER_TITLES[trigger.kind] ?? TRIGGER_TITLES.manual,
    detail: reason === '' ? '' : reason.charAt(0).toLocaleUpperCase() + reason.slice(1),
  };
}
