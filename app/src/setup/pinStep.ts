import { PIN_MAX_LENGTH, PIN_MIN_LENGTH, type PinField } from '../pin/pinRules';
import type { SetupErrors } from './setupDraft';

// The PIN step's cards and checks (docs/design/screens/Setup-PINs.html). Pure. Setup never reads
// a PIN back out of the store, so a stored PIN is drawn as four dots without its length.

export const PIN_TITLES: Readonly<Record<PinField, string>> = { safePin: 'Safe PIN', duressPin: 'Duress PIN' };

/** The same mid-sentence ("Change safe PIN"). */
export const PIN_PHRASES: Readonly<Record<PinField, string>> = { safePin: 'safe PIN', duressPin: 'duress PIN' };

const OTHER: Readonly<Record<PinField, PinField>> = { safePin: 'duressPin', duressPin: 'safePin' };

export function otherPin(field: PinField): PinField {
  return OTHER[field];
}

export interface PinCardState {
  isSet: boolean;
  /** Dots to fill. */
  filled: number;
  /** What VoiceOver reads for the dots ("Safe PIN set, 4 digits"). */
  label: string;
}

/** A card's dots: the new PIN's length, four for a stored one, none when neither. */
export function pinCardState(field: PinField, entered: string, hasPins: boolean): PinCardState {
  const title = PIN_TITLES[field];
  if (entered !== '') return { isSet: true, filled: entered.length, label: `${title} set, ${entered.length} digits` };
  if (hasPins) return { isSet: true, filled: PIN_MIN_LENGTH, label: `${title} set` };
  return { isSet: false, filled: 0, label: `${title} not set` };
}

/** "The two PINs are different": `ok` (shown in mint), `same` (an error), `pending` (not both set yet). */
export type DifferentCheck = 'ok' | 'same' | 'pending';

export function differentCheck(pins: { safePin: string; duressPin: string }, hasPins: boolean): DifferentCheck {
  const { safePin, duressPin } = pins;
  // Both blank keeps the stored pair, which the store only accepts when they differ.
  if (safePin === '' && duressPin === '') return hasPins ? 'ok' : 'pending';
  if (safePin === '' || duressPin === '') return 'pending';
  return safePin === duressPin ? 'same' : 'ok';
}

/**
 * The message under a card. When PINs are stored and only the other one was changed, the
 * draft's "Enter 4 to 8 digits" for this one reads as if it were missing, so it says why instead:
 * both change together, which is how the two are checked against each other.
 */
export function pinFieldError(
  field: PinField,
  errors: SetupErrors,
  pins: { safePin: string; duressPin: string },
  hasPins: boolean
): string | undefined {
  const message = errors[field];
  if (message === undefined) return undefined;
  if (hasPins && pins[field] === '' && pins[otherPin(field)] !== '') return 'Change both PINs together';
  return message;
}

/** Adds a digit to the entry being typed; extra digits past the longest PIN are ignored. */
export function appendDigit(entry: string, digit: string): string {
  return entry.length >= PIN_MAX_LENGTH ? entry : entry + digit;
}

/** Why the entry can't be used yet, or null when it can. */
export function entryProblem(field: PinField, entry: string, other: string): string | null {
  if (entry.length < PIN_MIN_LENGTH) return `Enter ${PIN_MIN_LENGTH} to ${PIN_MAX_LENGTH} digits`;
  if (other !== '' && entry === other) return `Must be different from your ${PIN_PHRASES[otherPin(field)]}`;
  return null;
}
