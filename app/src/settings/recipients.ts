import { randomUUID } from 'expo-crypto';

import type { Recipient, RecipientKind, RecipientPermissions, Settings } from '../../modules/raveguard-native';
import { DEFAULT_PERMISSIONS } from './defaults';

// Editing the recipient list (for the setup flow, K5). Every function returns new settings and
// leaves its input alone; the list stays in texting order with `order` renumbered 1, 2, 3…

export interface RecipientDraft {
  name: string;
  /** As typed: "(416) 555-0123" becomes "+14165550123". */
  phone: string;
  kind: RecipientKind;
  /** Anything left out takes DEFAULT_PERMISSIONS. */
  permissions?: Partial<RecipientPermissions>;
}

export type RecipientChanges = Partial<Pick<RecipientDraft, 'name' | 'phone' | 'kind'>>;

/** Makes recipient ids. Tests pass a predictable one; the app uses expo-crypto's UUID v4. */
export type IdFactory = () => string;

const NORTH_AMERICAN_DIGITS = 10;
const NORTH_AMERICAN_WITH_COUNTRY = 11;
const PHONE_PUNCTUATION = /[\s\-.()]/g;

/**
 * Strips spacing and punctuation, and adds +1 to a 10-digit (or 1 plus 10-digit) North
 * American number. Anything else is returned as is, for validation to accept or reject.
 */
export function normalizePhone(input: string): string {
  const compact = input.replace(PHONE_PUNCTUATION, '');
  if (compact.startsWith('+') || !/^\d+$/.test(compact)) return compact;
  if (compact.length === NORTH_AMERICAN_DIGITS) return `+1${compact}`;
  if (compact.length === NORTH_AMERICAN_WITH_COUNTRY && compact.startsWith('1')) return `+${compact}`;
  return compact;
}

export function createRecipient(draft: RecipientDraft, order: number, newId: IdFactory = randomUUID): Recipient {
  return {
    id: newId(),
    name: draft.name.trim(),
    phoneE164: normalizePhone(draft.phone),
    kind: draft.kind,
    order,
    permissions: { ...DEFAULT_PERMISSIONS, ...draft.permissions },
  };
}

function withRecipients(settings: Settings, recipients: readonly Recipient[]): Settings {
  return { ...settings, recipients: recipients.map((recipient, index) => ({ ...recipient, order: index + 1 })) };
}

function indexOf(settings: Settings, id: string): number {
  const index = settings.recipients.findIndex((recipient) => recipient.id === id);
  if (index < 0) throw new Error(`No recipient with id ${id}`);
  return index;
}

function replaceAt(settings: Settings, id: string, change: (recipient: Recipient) => Recipient): Settings {
  const index = indexOf(settings, id);
  return withRecipients(
    settings,
    settings.recipients.map((recipient, i) => (i === index ? change(recipient) : recipient))
  );
}

/** Adds a recipient at the end of the texting order. */
export function addRecipient(settings: Settings, draft: RecipientDraft, newId: IdFactory = randomUUID): Settings {
  const recipient = createRecipient(draft, settings.recipients.length + 1, newId);
  return withRecipients(settings, [...settings.recipients, recipient]);
}

export function updateRecipient(settings: Settings, id: string, changes: RecipientChanges): Settings {
  return replaceAt(settings, id, (recipient) => ({
    ...recipient,
    ...(changes.name !== undefined && { name: changes.name.trim() }),
    ...(changes.phone !== undefined && { phoneE164: normalizePhone(changes.phone) }),
    ...(changes.kind !== undefined && { kind: changes.kind }),
  }));
}

export function setRecipientPermission(
  settings: Settings,
  id: string,
  permission: keyof RecipientPermissions,
  value: boolean
): Settings {
  return replaceAt(settings, id, (recipient) => ({
    ...recipient,
    permissions: { ...recipient.permissions, [permission]: value },
  }));
}

export function removeRecipient(settings: Settings, id: string): Settings {
  const index = indexOf(settings, id);
  return withRecipients(
    settings,
    settings.recipients.filter((_, i) => i !== index)
  );
}

/** Moves a recipient to `position` (0 = texted first); the others shift to make room. */
export function moveRecipient(settings: Settings, id: string, position: number): Settings {
  const from = indexOf(settings, id);
  const last = settings.recipients.length - 1;
  if (!Number.isInteger(position) || position < 0 || position > last) {
    throw new RangeError(`moveRecipient: position must be from 0 to ${last} (got ${position})`);
  }
  const without = settings.recipients.filter((_, i) => i !== from);
  return withRecipients(settings, [...without.slice(0, position), settings.recipients[from], ...without.slice(position)]);
}
