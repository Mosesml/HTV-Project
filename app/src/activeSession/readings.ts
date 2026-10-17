import type { MotionState, NoiseBackend, NoiseEvent } from '../../modules/raveguard-native';

// Plain-text renderings for the Active session screen (K8, PRD UI-2). Each one shows a dash
// for a value the module hasn't sent yet: onHearing sends nulls until backlog BL1 lands.

export const NO_VALUE = '—';

const MS_PER_MINUTE = 60_000;

/** Moses's ShortcutsController: Adaptive below this level, Noise Cancellation from it. */
export const NOISE_CANCELLATION_FROM = 70;

function isKnown(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

export function formatRoomDb(roomDb: number | null): string {
  return isKnown(roomDb) ? `${Math.round(roomDb)} dB` : NO_VALUE;
}

/** The share of the daily allowance (85 dB for 8 h). The screen labels it an estimate (HRG-2). */
export function formatDose(dosePercent: number | null): string {
  return isKnown(dosePercent) ? `${Math.round(dosePercent)}%` : NO_VALUE;
}

const MOTION_LABELS: Record<MotionState, string> = {
  dancing: 'Dancing',
  walking: 'Walking',
  still: 'Still',
  fallen: 'Fallen',
  unknown: 'Unknown',
};

export function motionLabel(state: MotionState | null): string {
  return state ? MOTION_LABELS[state] : NO_VALUE;
}

/** `at` is the snapshot's `nextCheckInAt` (epoch ms): null in demo mode or when none is scheduled. */
export function describeNextCheckIn(at: number | null, now: number): string {
  if (at === null) return NO_VALUE;
  const msLeft = at - now;
  if (msLeft <= 0) return 'Any moment now';
  if (msLeft < MS_PER_MINUTE) return 'In under a minute';
  return `In ${Math.ceil(msLeft / MS_PER_MINUTE)} min`;
}

/** The AirPods listening mode RaveGuard asks for at this level. */
export function protectionMode(level: number): string {
  return level >= NOISE_CANCELLATION_FROM ? 'Noise Cancellation' : 'Adaptive';
}

const BACKEND_NAMES: Record<Exclude<NoiseBackend, 'off'>, { connected: string; disconnected: string }> = {
  automation: { connected: 'Through background relay', disconnected: 'Background relay not confirmed' },
  shortcuts: { connected: 'Through Shortcuts', disconnected: 'Shortcuts not connected' },
  bridge: { connected: 'Through the bridge', disconnected: 'Bridge not connected' },
};

/** How the level reaches the AirPods, from `onNoise`. */
export function describeNoiseBackend(noise: NoiseEvent): string {
  if (noise.backend === 'off') return 'AirPods control off';
  const names = BACKEND_NAMES[noise.backend];
  return noise.connected ? names.connected : names.disconnected;
}
