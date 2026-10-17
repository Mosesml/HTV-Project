import type { MotionState, NoiseBackend, NoiseEvent } from '../../modules/raveguard-native';
import type { StatusTone } from '../ui/StatusDot';
import { NO_VALUE, NO_VALUE_SPOKEN } from '../ui/text';

// Plain-text renderings for the Active session screen (K8, PRD UI-2). Each one shows a dash
// for a value the module hasn't sent yet: onHearing sends nulls until backlog BL1 lands.

export { NO_VALUE };

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;
const PERCENT = 100;

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

/** The AirPods listening mode RaveGuard asks for at this level. */
export function protectionMode(level: number): string {
  return level >= NOISE_CANCELLATION_FROM ? 'Noise Cancellation' : 'Adaptive';
}

// MARK: Redesigned Active session (docs/design/screens/Active.html)

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

function wholeMinutes(ms: number): { hours: number; minutes: number } {
  const total = Math.floor(Math.max(0, ms) / MS_PER_MINUTE);
  return { hours: Math.floor(total / MINUTES_PER_HOUR), minutes: total % MINUTES_PER_HOUR };
}

/** How long the session has run, for the "Session live" pill: "12m", "1h 42m". */
export function formatElapsed(ms: number): string {
  const { hours, minutes } = wholeMinutes(ms);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** The same, in words for VoiceOver: "under a minute", "1 hour 42 minutes". */
export function spokenElapsed(ms: number): string {
  const { hours, minutes } = wholeMinutes(ms);
  if (hours === 0 && minutes === 0) return 'under a minute';
  return [hours > 0 && plural(hours, 'hour'), minutes > 0 && plural(minutes, 'minute')].filter(Boolean).join(' ');
}

function secondsLeft(at: number, now: number): number {
  return Math.max(0, Math.ceil((at - now) / MS_PER_SECOND));
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

/** The next check-in as "12:40" (seconds rounded up, never below 00:00); "—" when none is scheduled (demo mode). */
export function formatCountdown(at: number | null, now: number): string {
  if (at === null) return NO_VALUE;
  const seconds = secondsLeft(at, now);
  return `${twoDigits(Math.floor(seconds / SECONDS_PER_MINUTE))}:${twoDigits(seconds % SECONDS_PER_MINUTE)}`;
}

/** The whole "Next check-in in …" line in words for VoiceOver. */
export function spokenCountdown(at: number | null, now: number): string {
  if (at === null) return 'Next check-in: not scheduled';
  const seconds = secondsLeft(at, now);
  if (seconds === 0) return 'Next check-in any moment now';
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  const rest = seconds % SECONDS_PER_MINUTE;
  const parts = [minutes > 0 && plural(minutes, 'minute'), rest > 0 && plural(rest, 'second')].filter(Boolean);
  return `Next check-in in ${parts.join(' ')}`;
}

/** Room dB for a MetricTile ("98", the unit drawn beside it), or "—". */
export function roomDbValue(roomDb: number | null): string {
  return isKnown(roomDb) ? String(Math.round(roomDb)) : NO_VALUE;
}

/** In-ear dB for a MetricTile ("~76": it is room dB minus an estimated attenuation), or "—". */
export function inEarDbValue(inEarDb: number | null): string {
  return isKnown(inEarDb) ? `~${Math.round(inEarDb)}` : NO_VALUE;
}

/** Tonight's dose as a bar fraction (can pass 1; the bar stops full), or null while unknown. */
export function doseFraction(dosePercent: number | null): number | null {
  return isKnown(dosePercent) ? dosePercent / PERCENT : null;
}

/** What VoiceOver reads as the dose bar's value. */
export function doseSpoken(dosePercent: number | null): string {
  return isKnown(dosePercent) ? `${Math.round(dosePercent)} percent of a safe daily amount` : NO_VALUE_SPOKEN;
}

/** The line under the dose bar. `floor` is the protection floor that rises with dose (PRD HRG-3); null until Swift sends one. */
export function floorLine(floor: number | null): string {
  const floorText = isKnown(floor) ? `Protection floor has risen to ${Math.round(floor)}.` : `Protection floor: ${NO_VALUE}.`;
  return `100% is a full day's safe exposure. ${floorText}`;
}

export interface MiniStatus {
  status: string;
  tone: StatusTone;
}

/** The AirPods mini card, from `useSessionState().airPodsConnected`. */
export function airPodsStatus(connected: boolean | null): MiniStatus {
  if (connected === null) return { status: NO_VALUE, tone: 'off' };
  return connected ? { status: 'Connected', tone: 'ok' } : { status: 'Not connected', tone: 'warning' };
}

const NOISE_TITLES: Record<NoiseBackend, string> = {
  automation: 'Background relay',
  bridge: 'Bridge',
  shortcuts: 'Shortcuts',
  off: 'Noise control',
};

/** The Bridge mini card: the backend that reaches the AirPods, its mode and level, from `onNoise`. */
export function noiseStatus(noise: NoiseEvent | null): MiniStatus & { title: string } {
  if (noise === null) return { title: NOISE_TITLES.bridge, status: NO_VALUE, tone: 'off' };
  const title = NOISE_TITLES[noise.backend];
  if (noise.backend === 'off') return { title, status: 'Off', tone: 'off' };
  if (!noise.connected) return { title, status: 'Not connected', tone: 'warning' };
  return { title, status: `${protectionMode(noise.level)} · ${noise.level}`, tone: 'ok' };
}
