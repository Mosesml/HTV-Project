import type {
  Recipient,
  RecipientKind,
  RecipientPermissions,
  Settings,
} from '../../modules/raveguard-native';
import {
  INTERVALS_MIN,
  LOUDNESS_MAX_DB,
  LOUDNESS_MIN_DB,
  MAX_NAME_LENGTH,
  MAX_SELF_DESCRIPTION_LENGTH,
} from './defaults';

// Checks settings before they are saved or sent through configure(). The rules match Swift's
// ModuleSettings (so a saved file is never refused) plus two of our own: names and the
// self-description have length limits, and recipients are kept in texting order.

export interface SettingsIssue {
  /** Where the problem is, e.g. "recipients[0].phoneE164". */
  path: string;
  /** What is wrong, e.g. "must not be blank". */
  message: string;
}

export type SettingsValidation =
  | { ok: true; settings: Settings }
  | { ok: false; issues: SettingsIssue[] };

export class SettingsValidationError extends Error {
  readonly issues: readonly SettingsIssue[];

  constructor(issues: readonly SettingsIssue[]) {
    super(`Settings not saved: ${issues.map(describeIssue).join('; ')}`);
    this.name = 'SettingsValidationError';
    this.issues = issues;
  }
}

/** Same pattern as Swift's `ModuleFields.phone`. */
export const E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** http or https, a host, then an optional port and path. */
const HTTP_URL_PATTERN = /^https?:\/\/[^\s/?#:@]+(:\d{1,5})?([/?#]\S*)?$/i;
const RECIPIENT_KINDS: readonly RecipientKind[] = ['contact', 'venueStaff'];
const PERMISSION_KEYS: readonly (keyof RecipientPermissions)[] = [
  'receiveAlerts',
  'seeLocation',
  'seeFullBrief',
  'canResolve',
];

type Fields = Record<string, unknown>;

export function describeIssue(issue: SettingsIssue): string {
  return `${issue.path} ${issue.message}`;
}

function isObject(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Collects issues for one object; each reader returns a value of the right type either way. */
class FieldReader {
  constructor(
    private readonly fields: Fields,
    private readonly prefix: string,
    private readonly issues: SettingsIssue[]
  ) {}

  path(key: string): string {
    return this.prefix ? `${this.prefix}.${key}` : key;
  }

  fail(key: string, message: string): void {
    this.issues.push({ path: this.path(key), message });
  }

  string(key: string, maxLength?: number): string {
    const value = this.fields[key];
    if (typeof value !== 'string') {
      this.fail(key, 'must be a string');
      return '';
    }
    if (maxLength !== undefined && value.length > maxLength) {
      this.fail(key, `must be ${maxLength} characters or fewer (got ${value.length})`);
    }
    return value;
  }

  nonBlank(key: string, maxLength: number): string {
    const value = this.fields[key];
    if (typeof value === 'string' && value.trim() === '') {
      this.fail(key, 'must not be blank');
      return value;
    }
    return this.string(key, maxLength);
  }

  boolean(key: string): boolean {
    const value = this.fields[key];
    if (typeof value !== 'boolean') this.fail(key, 'must be true or false');
    return value === true;
  }

  number(key: string): number | null {
    const value = this.fields[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      this.fail(key, 'must be a number');
      return null;
    }
    return value;
  }

  phone(key: string): string {
    const value = this.string(key);
    if (typeof this.fields[key] === 'string' && !E164_PATTERN.test(value)) {
      this.fail(key, `must be an E.164 phone number like +14165550123 (got ${value})`);
    }
    return value;
  }

  optional<T>(key: string, read: (key: string) => T): T | null {
    const value = this.fields[key];
    return value === null || value === undefined ? null : read(key);
  }

  httpUrl(key: string): string {
    const value = this.fields[key];
    if (typeof value !== 'string' || !HTTP_URL_PATTERN.test(value)) {
      this.fail(key, 'must be an http or https URL');
      return '';
    }
    return value;
  }
}

function readPermissions(reader: FieldReader, raw: unknown, issues: SettingsIssue[]): RecipientPermissions {
  if (!isObject(raw)) {
    reader.fail('permissions', 'must be an object');
    return { receiveAlerts: false, seeLocation: false, seeFullBrief: false, canResolve: false };
  }
  const permissions = new FieldReader(raw, reader.path('permissions'), issues);
  const [receiveAlerts, seeLocation, seeFullBrief, canResolve] = PERMISSION_KEYS.map((key) =>
    permissions.boolean(key)
  );
  return { receiveAlerts, seeLocation, seeFullBrief, canResolve };
}

function readRecipient(raw: unknown, index: number, issues: SettingsIssue[]): Recipient | null {
  const path = `recipients[${index}]`;
  if (!isObject(raw)) {
    issues.push({ path, message: 'must be an object' });
    return null;
  }
  const reader = new FieldReader(raw, path, issues);
  const id = reader.string('id');
  if (typeof raw.id === 'string' && !UUID_PATTERN.test(id)) reader.fail('id', 'must be a UUID');
  const name = reader.nonBlank('name', MAX_NAME_LENGTH);
  const phoneE164 = reader.phone('phoneE164');
  const kind = raw.kind as RecipientKind;
  if (!RECIPIENT_KINDS.includes(kind)) reader.fail('kind', `must be contact or venueStaff (got ${String(raw.kind)})`);
  const order = raw.order as number;
  if (order !== index + 1) {
    reader.fail('order', `must be ${index + 1} (recipients are kept in texting order; got ${String(raw.order)})`);
  }
  const permissions = readPermissions(reader, raw.permissions, issues);
  return { id, name, phoneE164, kind, order, permissions };
}

function checkDuplicates(recipients: readonly Recipient[], issues: SettingsIssue[]): void {
  recipients.forEach((recipient, index) => {
    const earlier = recipients.slice(0, index);
    const sameId = earlier.findIndex((other) => other.id.toLowerCase() === recipient.id.toLowerCase());
    if (sameId >= 0) issues.push({ path: `recipients[${index}].id`, message: `is the same as recipients[${sameId}].id` });
    const samePhone = earlier.findIndex((other) => other.phoneE164 === recipient.phoneE164);
    if (samePhone >= 0) {
      issues.push({ path: `recipients[${index}].phoneE164`, message: `is the same number as recipients[${samePhone}]` });
    }
  });
}

function readRecipients(raw: unknown, issues: SettingsIssue[]): Recipient[] {
  if (!Array.isArray(raw)) {
    issues.push({ path: 'recipients', message: 'must be an array' });
    return [];
  }
  const recipients = raw.map((item, index) => readRecipient(item, index, issues));
  const valid = recipients.filter((recipient): recipient is Recipient => recipient !== null);
  if (valid.length === recipients.length) checkDuplicates(valid, issues);
  return valid;
}

function readTarget(reader: FieldReader): number {
  const value = reader.number('loudnessTarget');
  if (value !== null && (value < LOUDNESS_MIN_DB || value > LOUDNESS_MAX_DB)) {
    reader.fail('loudnessTarget', `must be between ${LOUDNESS_MIN_DB} and ${LOUDNESS_MAX_DB} dB (got ${value})`);
  }
  return value ?? 0;
}

function readInterval(reader: FieldReader, raw: unknown): Settings['intervalMin'] {
  const interval = raw as Settings['intervalMin'];
  if (!INTERVALS_MIN.includes(interval)) {
    reader.fail('intervalMin', `must be ${INTERVALS_MIN.join(' or ')} (got ${String(raw)})`);
  }
  return interval;
}

/**
 * Checks `input` and returns a fresh copy holding only the `Settings` fields, or every issue
 * found (not just the first), so a form can mark them all.
 */
export function validateSettings(input: unknown): SettingsValidation {
  if (!isObject(input)) return { ok: false, issues: [{ path: 'settings', message: 'must be an object' }] };
  const issues: SettingsIssue[] = [];
  const reader = new FieldReader(input, '', issues);
  const settings: Settings = {
    wearerName: reader.nonBlank('wearerName', MAX_NAME_LENGTH),
    selfDescription: reader.string('selfDescription', MAX_SELF_DESCRIPTION_LENGTH),
    recipients: readRecipients(input.recipients, issues),
    intervalMin: readInterval(reader, input.intervalMin),
    loudnessTarget: readTarget(reader),
    demo: reader.boolean('demo'),
    teammatePhone: reader.optional('teammatePhone', (key) => reader.phone(key)),
    bridgeUrl: reader.optional('bridgeUrl', (key) => reader.httpUrl(key)),
  };
  return issues.length === 0 ? { ok: true, settings } : { ok: false, issues };
}

/** The clean copy of `input`, or a SettingsValidationError listing every issue. */
export function assertValidSettings(input: unknown): Settings {
  const result = validateSettings(input);
  if (!result.ok) throw new SettingsValidationError(result.issues);
  return result.settings;
}
