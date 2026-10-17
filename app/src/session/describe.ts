import type { MotionEvent, PhaseEvent, RecipientStatus, SessionPhaseName } from '../../modules/raveguard-native';

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

export function describeMotion(motion: MotionEvent | null): string {
  if (!motion) return 'no readouts yet (start a session)';
  return `${motion.state} · pitch ${motion.pitch.toFixed(1)}° · roll ${motion.roll.toFixed(1)}° · ${motion.accelG.toFixed(2)} g`;
}

/** One Alert screen row: "Sam: acknowledged". */
export function describeRecipient(recipient: RecipientStatus): string {
  if (recipient.ackedAt !== null) return `${recipient.name}: acknowledged`;
  if (recipient.notifiedAt !== null) return `${recipient.name}: texted`;
  return `${recipient.name}: not texted yet`;
}
