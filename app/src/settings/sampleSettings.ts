import type { Settings } from '../../modules/raveguard-native';
import { DEFAULT_SETTINGS } from './defaults';
import { addRecipient, type IdFactory, type RecipientDraft } from './recipients';

// What the Debug screen's "Save sample settings" stores, so settings storage can be tried on
// the phone before the setup flow (K5) exists. The numbers are fictional 555-01xx numbers.

export const SAMPLE_SETTINGS_DRAFT: Omit<Settings, 'recipients'> = {
  ...DEFAULT_SETTINGS,
  wearerName: 'Sample wearer',
  selfDescription: 'black hoodie, white cap',
  intervalMin: 60,
  loudnessTarget: 90,
};

const SAMPLE_RECIPIENTS: readonly RecipientDraft[] = [
  { name: 'Contact 1', phone: '+14165550101', kind: 'contact', permissions: { seeLocation: true, seeFullBrief: true } },
  { name: 'Contact 2', phone: '+14165550102', kind: 'contact' },
  { name: 'Venue staff', phone: '+14165550103', kind: 'venueStaff', permissions: { seeLocation: true } },
];

/** Sample settings with fresh recipient ids. */
export function buildSampleSettings(newId?: IdFactory): Settings {
  return SAMPLE_RECIPIENTS.reduce<Settings>(
    (settings, draft) => addRecipient(settings, draft, newId),
    { ...SAMPLE_SETTINGS_DRAFT, recipients: [] }
  );
}
