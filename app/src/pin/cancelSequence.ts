import { NotificationFeedbackType } from 'expo-haptics';

import type { PinResultKind } from '../../modules/raveguard-native';

// The cancel a correct PIN starts (K9, PRD D7, UI-4). Safe and duress run the same sequence:
// the same haptic, "Cancelling…" for a fixed 600 ms, then "Cancelled. Stay safe.".

/** How long "Cancelling…" shows, whatever Swift does with the PIN result. */
export const CANCELLING_MS = 600;

/** The one haptic both PINs play as "Cancelling…" appears. */
export const CANCEL_HAPTIC = NotificationFeedbackType.Success;

/** The PIN results that cancel. The kind goes to Swift and nowhere else. */
export type CancelKind = Exclude<PinResultKind, 'wrong'>;

/** What the PIN screen shows: the PIN field, "Cancelling…", or "Cancelled. Stay safe.". */
export type CancelStep = 'entering' | 'cancelling' | 'cancelled';
