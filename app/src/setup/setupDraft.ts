import { randomUUID } from 'expo-crypto';

import type { Recipient, Settings } from '../../modules/raveguard-native';
import { validatePins, type PinPair } from '../pin/pinRules';
import {
  DEFAULT_PERMISSIONS,
  LOUDNESS_MAX_DB,
  LOUDNESS_MIN_DB,
  MAX_MEETING_SPOT_LENGTH,
  MAX_NAME_LENGTH,
  MAX_SELF_DESCRIPTION_LENGTH,
} from '../settings/defaults';
import { normalizePhone, type IdFactory } from '../settings/recipients';
import { describeIssue, validateSettings, type SettingsIssue } from '../settings/validateSettings';
import { isBlankRow, rowsFromRecipients, starterRows, type RecipientRow } from './setupRows';

// The setup draft (K5) and the one check that turns it into settings plus PINs.
// Pure: the three setup steps edit one draft (setupWizardStore.ts), and checkSetup either gives
// what to save or an error message for each field, keyed the way the steps look them up.

export interface SetupDraft {
  wearerName: string;
  selfDescription: string;
  /** Where friends should look for the wearer; empty when not set. */
  meetingSpot: string;
  intervalMin: Settings['intervalMin'];
  /** As typed, so the field can be empty while the wearer edits it. */
  loudnessTarget: string;
  /** In texting order. Blank rows are dropped when saving. */
  recipients: readonly RecipientRow[];
  /** J15: opted in as a nearby responder, and the name and number nearby alerts reach. */
  responderEnabled: boolean;
  responderName: string;
  responderPhone: string;
  /** Always blank when the form opens; PINs are never read back out of the store. */
  safePin: string;
  duressPin: string;
}

/**
 * One message per field. Keys: wearerName, selfDescription, meetingSpot, loudnessTarget, recipients,
 * safePin, duressPin, rowFieldKey(id, 'name' | 'phone'), and form (anything else).
 */
export type SetupErrors = Readonly<Record<string, string>>;

export type SetupCheck =
  | { ok: true; settings: Settings; pins: PinPair | null }
  | { ok: false; errors: SetupErrors };

export interface DraftOptions {
  /** False on a fresh install: the wearer name starts blank instead of "Demo wearer". */
  isSaved: boolean;
  newId?: IdFactory;
}

const LOUDNESS_PATTERN = /^\d{1,3}(\.\d+)?$/;
const RECIPIENT_PATH = /^recipients\[(\d+)\]\.(\w+)$/;
const SAME_NUMBER = /same number as recipients\[(\d+)\]/;
const PHONE_HINT = 'Enter a full phone number, like 416 555 0123 or +44 20 7946 0958';
const LOUDNESS_HINT = `Enter a level from ${LOUDNESS_MIN_DB} to ${LOUDNESS_MAX_DB} dB`;

export function rowFieldKey(rowId: string, field: 'name' | 'phone'): string {
  return `recipient:${rowId}:${field}`;
}

export function draftFromSettings(settings: Settings, { isSaved, newId = randomUUID }: DraftOptions): SetupDraft {
  return {
    wearerName: isSaved ? settings.wearerName : '',
    selfDescription: settings.selfDescription,
    meetingSpot: settings.meetingSpot,
    intervalMin: settings.intervalMin,
    loudnessTarget: String(settings.loudnessTarget),
    recipients: settings.recipients.length > 0 ? rowsFromRecipients(settings.recipients) : starterRows(newId),
    responderEnabled: !!settings.responder,
    responderName: settings.responder?.name ?? '',
    responderPhone: settings.responder?.phoneE164 ?? '',
    safePin: '',
    duressPin: '',
  };
}

function parseLoudness(text: string): number {
  const trimmed = text.trim();
  return LOUDNESS_PATTERN.test(trimmed) ? Number(trimmed) : Number.NaN;
}

function toRecipient(row: RecipientRow, index: number): Recipient {
  return {
    id: row.id,
    name: row.name.trim(),
    phoneE164: normalizePhone(row.phone),
    kind: row.kind,
    order: index + 1,
    permissions: { ...DEFAULT_PERMISSIONS },
  };
}

function nameMessage(issue: SettingsIssue, ifBlank: string): string {
  return issue.message.includes('blank') ? ifBlank : `Use ${MAX_NAME_LENGTH} characters or fewer`;
}

/** Where a validateSettings issue goes on the form, and what it says there. */
function placeIssue(issue: SettingsIssue, kept: readonly RecipientRow[], allRows: readonly RecipientRow[]): [string, string] {
  const match = RECIPIENT_PATH.exec(issue.path);
  if (match) {
    const row = kept[Number(match[1])];
    if (match[2] === 'name') return [rowFieldKey(row.id, 'name'), nameMessage(issue, 'Enter a name')];
    if (match[2] === 'phoneE164') {
      const same = SAME_NUMBER.exec(issue.message);
      const message = same ? `Same number as recipient ${allRows.indexOf(kept[Number(same[1])]) + 1}` : PHONE_HINT;
      return [rowFieldKey(row.id, 'phone'), message];
    }
    return ['form', describeIssue(issue)];
  }
  switch (issue.path) {
    case 'wearerName':
      return ['wearerName', nameMessage(issue, 'Enter your name')];
    case 'selfDescription':
      return ['selfDescription', `Use ${MAX_SELF_DESCRIPTION_LENGTH} characters or fewer`];
    case 'meetingSpot':
      return ['meetingSpot', `Use ${MAX_MEETING_SPOT_LENGTH} characters or fewer`];
    case 'loudnessTarget':
      return ['loudnessTarget', LOUDNESS_HINT];
    case 'responder.name':
      return ['responderName', nameMessage(issue, 'Enter the name responders will see')];
    case 'responder.phoneE164':
      return ['responderPhone', PHONE_HINT];
    default:
      return ['form', describeIssue(issue)];
  }
}

/** Both PINs blank keeps the stored ones; otherwise both must be entered and pass the rules. */
function checkPins(draft: SetupDraft, hasPins: boolean): { pins: PinPair | null; errors: [string, string][] } {
  if (hasPins && draft.safePin === '' && draft.duressPin === '') return { pins: null, errors: [] };
  const pins = { safePin: draft.safePin, duressPin: draft.duressPin };
  return { pins, errors: validatePins(pins).map((issue) => [issue.field, issue.message]) };
}

/** The first message for each key wins. */
function collect(entries: readonly [string, string][]): SetupErrors {
  return entries.reduce<Record<string, string>>(
    (errors, [key, message]) => (key in errors ? errors : { ...errors, [key]: message }),
    {}
  );
}

/**
 * Turns the draft into settings (on top of `base`, so fields the form doesn't show, such as
 * demo and teammatePhone, are kept) and the PINs to store, or explains every problem.
 */
export function checkSetup(draft: SetupDraft, base: Settings, { hasPins }: { hasPins: boolean }): SetupCheck {
  const kept = draft.recipients.filter((row) => !isBlankRow(row));
  const candidate: Settings = {
    ...base,
    wearerName: draft.wearerName.trim(),
    selfDescription: draft.selfDescription.trim(),
    meetingSpot: draft.meetingSpot.trim(),
    intervalMin: draft.intervalMin,
    loudnessTarget: parseLoudness(draft.loudnessTarget),
    recipients: kept.map(toRecipient),
  };
  delete candidate.responder;
  if (draft.responderEnabled) {
    candidate.responder = { enabled: true, name: draft.responderName.trim(), phoneE164: normalizePhone(draft.responderPhone) };
  }
  const validation = validateSettings(candidate);
  const settingsErrors = validation.ok ? [] : validation.issues.map((issue) => placeIssue(issue, kept, draft.recipients));
  const contactErrors: [string, string][] = kept.some((row) => row.kind === 'contact')
    ? []
    : [['recipients', 'Add at least one contact to text']];
  const pinCheck = checkPins(draft, hasPins);
  const errors = collect([...settingsErrors, ...contactErrors, ...pinCheck.errors]);

  if (!validation.ok || Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, settings: validation.settings, pins: pinCheck.pins };
}
