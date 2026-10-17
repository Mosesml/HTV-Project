import type { RecipientKind, RecipientPermissions } from '../../modules/raveguard-native';
import type { RecipientRow } from './setupRows';

// The permissions step's names and "What Theo would get" preview
// (docs/design/screens/Setup-Permissions.html). Pure. The preview describes what the alert text
// carries for one recipient; it never claims a diagnosis ("missed a safety check-in").

export interface PermissionLine {
  key: keyof RecipientPermissions;
  title: string;
  subtitle: string;
  /** Shown on and can't be changed. */
  isLocked: boolean;
}

/** The grid's rows, in the mockup's order. "Get alerts" is locked on: everyone in the chain is there to be alerted. */
export const PERMISSION_LINES: readonly PermissionLine[] = [
  { key: 'receiveAlerts', title: 'Get alerts', subtitle: 'Always on', isLocked: true },
  { key: 'seeLocation', title: 'See location', subtitle: 'Only once an alert starts', isLocked: false },
  { key: 'seeFullBrief', title: 'Full details', subtitle: 'Off: a short version', isLocked: false },
  { key: 'canResolve', title: 'Mark resolved', subtitle: 'Can stop the alert', isLocked: false },
];

/** Recipients per grid: three columns fit a phone; more start another grid below. */
export const GRID_COLUMNS = 3;

function firstWord(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

/** The column heading: the first name, or "Venue" for venue staff (as the mockup draws it). */
export function shortName(row: Pick<RecipientRow, 'name' | 'kind'>): string {
  if (row.kind === 'venueStaff') return 'Venue';
  return firstWord(row.name) || 'Contact';
}

/** What VoiceOver calls the recipient in the grid ("Maya", "Venue staff"); made unique with the position. */
export function spokenNames(rows: readonly Pick<RecipientRow, 'name' | 'kind'>[]): readonly string[] {
  const base = rows.map((row) => (row.kind === 'venueStaff' ? 'Venue staff' : firstWord(row.name) || 'Contact'));
  return base.map((name, index) => (base.filter((other) => other === name).length > 1 ? `${name} ${index + 1}` : name));
}

const KIND_WORDS: Record<RecipientKind, string> = { contact: 'Contact', venueStaff: 'Venue staff' };

export function kindWord(kind: RecipientKind): string {
  return KIND_WORDS[kind];
}

function trust(permissions: RecipientPermissions): number {
  return Number(permissions.seeLocation) + Number(permissions.seeFullBrief);
}

/** The recipient who gets the least (fewest of location and full details); the earliest on a tie. */
export function leastTrusted<T extends Pick<RecipientRow, 'permissions'>>(rows: readonly T[]): T | null {
  return rows.reduce<T | null>((least, row) => (least === null || trust(row.permissions) < trust(least.permissions) ? row : least), null);
}

/** "01:44": the time a missed check-in would be reported, 24-hour like the alert text. */
export function clockTime(at: number): string {
  const date = new Date(at);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** The preview's two parts: the alert's opening line, quoted, and what else comes with it. */
export function previewBrief(
  wearerName: string,
  permissions: Pick<RecipientPermissions, 'seeLocation' | 'seeFullBrief'>,
  at: number
): { quote: string; extra: string } {
  const who = wearerName.trim() === '' ? 'You' : wearerName.trim();
  const quote = `"${who} missed a safety check-in at ${clockTime(at)}."`;
  if (permissions.seeLocation && permissions.seeFullBrief) return { quote, extra: 'With your location and the full details.' };
  if (permissions.seeLocation) return { quote, extra: 'With your location, no other details.' };
  if (permissions.seeFullBrief) return { quote, extra: 'With the full details, no location.' };
  return { quote, extra: 'No location, no details.' };
}
