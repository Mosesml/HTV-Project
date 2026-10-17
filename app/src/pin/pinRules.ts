// The rules both PINs follow (K5). The setup form checks them before saving, and every
// PinStore checks them again before storing, so two equal PINs can never be stored: if they
// were, a duress PIN could not be told apart from a safe one.

export const PIN_MIN_LENGTH = 4;
/** Also the most the PIN entry screen accepts. */
export const PIN_MAX_LENGTH = 8;

export interface PinPair {
  /** Cancels a check-in. */
  safePin: string;
  /** Looks like a safe cancel on the phone, but alerts Contact 1 with a duress flag. */
  duressPin: string;
}

export type PinField = keyof PinPair;

export interface PinIssue {
  field: PinField;
  message: string;
}

const DIGITS_ONLY = /^\d*$/;
const LENGTH_HINT = `${PIN_MIN_LENGTH} to ${PIN_MAX_LENGTH} digits`;

export class PinValidationError extends Error {
  readonly issues: readonly PinIssue[];

  constructor(issues: readonly PinIssue[]) {
    // Names the fields, never the PINs.
    super(`PINs not saved: ${issues.map((issue) => `${issue.field} ${issue.message}`).join('; ')}`);
    this.name = 'PinValidationError';
    this.issues = issues;
  }
}

function checkOne(pin: string): string | null {
  if (pin === '') return `Enter ${LENGTH_HINT}`;
  if (!DIGITS_ONLY.test(pin)) return 'Use digits only';
  if (pin.length < PIN_MIN_LENGTH || pin.length > PIN_MAX_LENGTH) return `Use ${LENGTH_HINT}`;
  return null;
}

/** Every problem with the pair: each PIN is 4 to 8 digits, and the two must differ. */
export function validatePins(pins: PinPair): PinIssue[] {
  const fields: PinField[] = ['safePin', 'duressPin'];
  const issues = fields.flatMap((field): PinIssue[] => {
    const message = checkOne(pins[field]);
    return message ? [{ field, message }] : [];
  });
  if (issues.length === 0 && pins.safePin === pins.duressPin) {
    return [{ field: 'duressPin', message: 'Must be different from your safe PIN' }];
  }
  return issues;
}

/** Throws PinValidationError unless the pair passes validatePins. */
export function assertValidPins(pins: PinPair): void {
  const issues = validatePins(pins);
  if (issues.length > 0) throw new PinValidationError(issues);
}
