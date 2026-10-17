import type { Recipient, RecipientKind, RecipientPermissions, Settings } from '../../modules/raveguard-native';

// Plain-text renderings of the saved settings, for the Setup summary.

const KIND_LABELS: Record<RecipientKind, string> = {
  contact: 'contact',
  venueStaff: 'venue staff',
};

/** "Check-in every 30 min · loudness target 85 dB · demo timings" */
export function describeTimings(settings: Settings): string {
  const timings = settings.demo ? 'demo timings' : 'real timings';
  return `Check-in every ${settings.intervalMin} min · loudness target ${settings.loudnessTarget} dB · ${timings}`;
}

/** "1. Sam (contact)" */
export function describeRecipientLine(recipient: Recipient): string {
  return `${recipient.order}. ${recipient.name} (${KIND_LABELS[recipient.kind]})`;
}

/** The permissions grid's labels (PRD PRV-3), in the order the setup form shows them. */
export const PERMISSION_LABELS: Readonly<Record<keyof RecipientPermissions, string>> = {
  receiveAlerts: 'Gets alerts',
  seeLocation: 'Sees location',
  seeFullBrief: 'Sees full brief',
  canResolve: 'Can resolve',
};

export const PERMISSION_KEYS = Object.keys(PERMISSION_LABELS) as readonly (keyof RecipientPermissions)[];

/** "Gets alerts, sees location, can resolve" */
export function describePermissions(permissions: RecipientPermissions): string {
  const granted = PERMISSION_KEYS.filter((key) => permissions[key]).map((key) => PERMISSION_LABELS[key].toLowerCase());
  if (granted.length === 0) return 'No alerts, nothing shared';
  const sentence = granted.join(', ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
