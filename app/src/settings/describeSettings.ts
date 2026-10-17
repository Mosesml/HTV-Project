import type { Recipient, RecipientKind, Settings } from '../../modules/raveguard-native';

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
