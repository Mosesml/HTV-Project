import { randomUUID } from 'expo-crypto';

import type { Recipient, RecipientKind, RecipientPermissions } from '../../modules/raveguard-native';
import { DEFAULT_PERMISSIONS } from '../settings/defaults';
import type { IdFactory } from '../settings/recipients';

// The recipient rows of the setup form (K5), in texting order. A row keeps the phone exactly
// as typed; setupDraft.ts turns rows into the module's Recipients when the wearer saves.
// Every function returns a new list and leaves its input alone.

export interface RecipientRow {
  /** The recipient id that gets saved: kept for saved recipients, a new UUID otherwise. */
  id: string;
  name: string;
  phone: string;
  kind: RecipientKind;
  permissions: RecipientPermissions;
}

export type RowChanges = Partial<Pick<RecipientRow, 'name' | 'phone'>>;

/** Contact 1 is texted first and trusted most: everything on (scenario 7: sees location). */
export const FIRST_CONTACT_PERMISSIONS: RecipientPermissions = {
  receiveAlerts: true,
  seeLocation: true,
  seeFullBrief: true,
  canResolve: true,
};

/** Venue staff need to find the wearer (PRD WEB-4), so they see location; the brief stays reduced. */
export const VENUE_STAFF_PERMISSIONS: RecipientPermissions = {
  ...DEFAULT_PERMISSIONS,
  seeLocation: true,
};

function starterPermissions(kind: RecipientKind, isFirstContact: boolean): RecipientPermissions {
  if (kind === 'venueStaff') return VENUE_STAFF_PERMISSIONS;
  return isFirstContact ? FIRST_CONTACT_PERMISSIONS : DEFAULT_PERMISSIONS;
}

function blankRow(kind: RecipientKind, isFirstContact: boolean, newId: IdFactory): RecipientRow {
  return { id: newId(), name: '', phone: '', kind, permissions: starterPermissions(kind, isFirstContact) };
}

/** What a fresh install shows: Contact 1, Contact 2 and venue staff, ready to fill in. */
export function starterRows(newId: IdFactory = randomUUID): readonly RecipientRow[] {
  return [blankRow('contact', true, newId), blankRow('contact', false, newId), blankRow('venueStaff', false, newId)];
}

export function rowsFromRecipients(recipients: readonly Recipient[]): readonly RecipientRow[] {
  return recipients.map(({ id, name, phoneE164, kind, permissions }) => ({
    id,
    name,
    phone: phoneE164,
    kind,
    permissions,
  }));
}

/** True when the row is left empty; empty rows are dropped when saving. */
export function isBlankRow(row: RecipientRow): boolean {
  return row.name.trim() === '' && row.phone.trim() === '';
}

function indexOfRow(rows: readonly RecipientRow[], id: string): number {
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) throw new Error(`No recipient row with id ${id}`);
  return index;
}

function replaceRow(rows: readonly RecipientRow[], id: string, change: (row: RecipientRow) => RecipientRow): readonly RecipientRow[] {
  const index = indexOfRow(rows, id);
  return rows.map((row, i) => (i === index ? change(row) : row));
}

export function updateRow(rows: readonly RecipientRow[], id: string, changes: RowChanges): readonly RecipientRow[] {
  return replaceRow(rows, id, (row) => ({ ...row, ...changes }));
}

export function setRowPermission(
  rows: readonly RecipientRow[],
  id: string,
  permission: keyof RecipientPermissions,
  value: boolean
): readonly RecipientRow[] {
  return replaceRow(rows, id, (row) => ({ ...row, permissions: { ...row.permissions, [permission]: value } }));
}

/** Swaps the row with the one above it (texted one place earlier). The first row stays put. */
export function moveRowUp(rows: readonly RecipientRow[], id: string): readonly RecipientRow[] {
  const index = indexOfRow(rows, id);
  if (index === 0) return rows;
  return rows.map((row, i) => {
    if (i === index - 1) return rows[index];
    if (i === index) return rows[index - 1];
    return row;
  });
}

/** Swaps the row with the one below it (texted one place later). The last row stays put. */
export function moveRowDown(rows: readonly RecipientRow[], id: string): readonly RecipientRow[] {
  const index = indexOfRow(rows, id);
  if (index === rows.length - 1) return rows;
  return moveRowUp(rows, rows[index + 1].id);
}

/** Moves the row to `toIndex` (clamped to the list), shifting the rows in between: a drag. */
export function moveRowTo(rows: readonly RecipientRow[], id: string, toIndex: number): readonly RecipientRow[] {
  const from = indexOfRow(rows, id);
  const to = Math.min(Math.max(0, Math.round(toIndex)), rows.length - 1);
  if (from === to) return rows;
  const without = rows.filter((_, i) => i !== from);
  return [...without.slice(0, to), rows[from], ...without.slice(to)];
}

/** Changes who the row is (a contact or venue staff); the permissions stay as they are. */
export function setRowKind(rows: readonly RecipientRow[], id: string, kind: RecipientKind): readonly RecipientRow[] {
  return replaceRow(rows, id, (row) => ({ ...row, kind }));
}

/**
 * Every row with "Get alerts" on. The redesigned setup shows it locked on (everyone in the
 * chain is there to be alerted), so a row saved with it off by the old form is turned back on.
 */
export function withAlertsOn(rows: readonly RecipientRow[]): readonly RecipientRow[] {
  return rows.map((row) => (row.permissions.receiveAlerts ? row : { ...row, permissions: { ...row.permissions, receiveAlerts: true } }));
}

export function removeRow(rows: readonly RecipientRow[], id: string): readonly RecipientRow[] {
  const index = indexOfRow(rows, id);
  return rows.filter((_, i) => i !== index);
}

/** Adds an empty row at the end of the texting order. */
export function appendRow(rows: readonly RecipientRow[], kind: RecipientKind, newId: IdFactory = randomUUID): readonly RecipientRow[] {
  const isFirstContact = kind === 'contact' && !rows.some((row) => row.kind === 'contact');
  return [...rows, blankRow(kind, isFirstContact, newId)];
}
