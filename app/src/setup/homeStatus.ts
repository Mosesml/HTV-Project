import type { NoiseBackend, NoiseEvent, Recipient } from '../../modules/raveguard-native';
import { NO_VALUE, NO_VALUE_SPOKEN } from '../ui/text';

// Home's status rows (docs/design/screens/Home.html), as words. Pure. Each row pairs the words
// with the status dot's tone, or null for no dot when nothing is known yet.

export type DotTone = 'ok' | 'off';

export interface StatusLine {
  text: string;
  /** What VoiceOver reads when it differs from `text` ("—" reads as nothing). */
  spoken: string;
  dot: DotTone | null;
}

/** AirPods: null until Swift reports, which it does once a session starts. */
export function airPodsStatus(connected: boolean | null): StatusLine {
  if (connected === null) return { text: 'Checked when the session starts', spoken: 'Checked when the session starts', dot: null };
  return connected
    ? { text: 'Connected · head motion streaming', spoken: 'Connected · head motion streaming', dot: 'ok' }
    : { text: 'Not connected', spoken: 'Not connected', dot: 'off' };
}

const BACKEND_NAMES: Record<NoiseBackend, string> = { bridge: 'Bridge', shortcuts: 'Shortcuts', off: 'Off' };

/** Hearing protection, from the last `onNoise` (or the snapshot). "—" until either arrives. */
export function hearingStatus(noise: NoiseEvent | null): StatusLine {
  if (noise === null) return { text: NO_VALUE, spoken: NO_VALUE_SPOKEN, dot: null };
  if (noise.backend === 'off') return { text: 'Off', spoken: 'Off', dot: 'off' };
  const text = `${BACKEND_NAMES[noise.backend]} · ${noise.connected ? 'connected' : 'not connected'}`;
  return { text, spoken: text, dot: noise.connected ? 'ok' : 'off' };
}

/** "Maya → Theo → Venue staff": first names in texting order, venue staff by what they are. */
export function alertChain(recipients: readonly Pick<Recipient, 'name' | 'kind'>[]): string {
  if (recipients.length === 0) return 'Nobody yet';
  return recipients.map((recipient) => (recipient.kind === 'venueStaff' ? 'Venue staff' : recipient.name.trim().split(/\s+/)[0])).join(' → ');
}
