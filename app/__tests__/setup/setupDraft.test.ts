import type { Settings } from '../../modules/raveguard-native';
import { DEFAULT_PERMISSIONS, DEFAULT_SETTINGS } from '../../src/settings/defaults';
import { checkSetup, draftFromSettings, rowFieldKey, type SetupDraft } from '../../src/setup/setupDraft';

const ID_1 = '11111111-1111-4111-8111-111111111111';
const ID_2 = '22222222-2222-4222-8222-222222222222';
const ID_3 = '33333333-3333-4333-8333-333333333333';

function ids(): () => string {
  const queue = [ID_1, ID_2, ID_3];
  return () => queue.shift() ?? 'out-of-ids';
}

/** A fresh-install draft with every field of scenario 7 filled in. */
function scenario7Draft(overrides: Partial<SetupDraft> = {}): SetupDraft {
  const draft = draftFromSettings(DEFAULT_SETTINGS, { isSaved: false, newId: ids() });
  const [first, second, staff] = draft.recipients;
  return {
    ...draft,
    wearerName: 'Alex',
    selfDescription: 'Green jacket, near the front left speaker',
    recipients: [
      { ...first, name: 'Sam', phone: '416 555 0101' },
      { ...second, name: 'Riley', phone: '(416) 555-0102' },
      { ...staff, name: 'Front desk', phone: '4165550103' },
    ],
    safePin: '2468',
    duressPin: '1357',
    ...overrides,
  };
}

describe('draftFromSettings', () => {
  test('a fresh install starts blank, with three rows and the default interval and target', () => {
    const draft = draftFromSettings(DEFAULT_SETTINGS, { isSaved: false, newId: ids() });
    expect(draft).toMatchObject({
      wearerName: '',
      selfDescription: '',
      intervalMin: 30,
      loudnessTarget: '85',
      safePin: '',
      duressPin: '',
    });
    expect(draft.recipients.map((row) => [row.kind, row.permissions])).toEqual([
      ['contact', DEFAULT_PERMISSIONS],
      ['contact', DEFAULT_PERMISSIONS],
      ['venueStaff', DEFAULT_PERMISSIONS],
    ]);
  });

  test('saved settings are loaded as they are, PINs always blank', () => {
    const check = checkSetup(scenario7Draft({ intervalMin: 60, loudnessTarget: '92' }), DEFAULT_SETTINGS, {
      hasPins: false,
    });
    if (!check.ok) throw new Error('expected a valid draft');
    const draft = draftFromSettings(check.settings, { isSaved: true });
    expect(draft).toMatchObject({ wearerName: 'Alex', intervalMin: 60, loudnessTarget: '92', safePin: '', duressPin: '' });
    expect(draft.recipients.map((row) => [row.id, row.name, row.phone])).toEqual([
      [ID_1, 'Sam', '+14165550101'],
      [ID_2, 'Riley', '+14165550102'],
      [ID_3, 'Front desk', '+14165550103'],
    ]);
  });

  test('saved settings without recipients get the three starter rows', () => {
    const draft = draftFromSettings({ ...DEFAULT_SETTINGS, wearerName: 'Alex' }, { isSaved: true, newId: ids() });
    expect(draft.wearerName).toBe('Alex');
    expect(draft.recipients).toHaveLength(3);
  });
});

describe('checkSetup', () => {
  test('saves all contacts with shared defaults and venue staff third', () => {
    const check = checkSetup(scenario7Draft(), DEFAULT_SETTINGS, { hasPins: false });
    expect(check).toEqual({
      ok: true,
      pins: { safePin: '2468', duressPin: '1357' },
      settings: {
        ...DEFAULT_SETTINGS,
        wearerName: 'Alex',
        selfDescription: 'Green jacket, near the front left speaker',
        recipients: [
          { id: ID_1, name: 'Sam', phoneE164: '+14165550101', kind: 'contact', order: 1, permissions: DEFAULT_PERMISSIONS },
          { id: ID_2, name: 'Riley', phoneE164: '+14165550102', kind: 'contact', order: 2, permissions: DEFAULT_PERMISSIONS },
          {
            id: ID_3,
            name: 'Front desk',
            phoneE164: '+14165550103',
            kind: 'venueStaff',
            order: 3,
            permissions: DEFAULT_PERMISSIONS,
          },
        ],
      },
    });
  });

  test('PINs must differ', () => {
    const check = checkSetup(scenario7Draft({ duressPin: '2468' }), DEFAULT_SETTINGS, { hasPins: false });
    expect(check).toEqual({ ok: false, errors: { duressPin: 'Must be different from your safe PIN' } });
  });

  test('PINs are required until both are set', () => {
    const check = checkSetup(scenario7Draft({ safePin: '', duressPin: '' }), DEFAULT_SETTINGS, { hasPins: false });
    expect(check).toEqual({ ok: false, errors: { safePin: 'Enter 4 to 8 digits', duressPin: 'Enter 4 to 8 digits' } });
  });

  test('blank PINs keep the PINs already set', () => {
    const check = checkSetup(scenario7Draft({ safePin: '', duressPin: '' }), DEFAULT_SETTINGS, { hasPins: true });
    expect(check).toMatchObject({ ok: true, pins: null });
  });

  test('changing one PIN means entering both', () => {
    const check = checkSetup(scenario7Draft({ safePin: '8642', duressPin: '' }), DEFAULT_SETTINGS, { hasPins: true });
    expect(check).toEqual({ ok: false, errors: { duressPin: 'Enter 4 to 8 digits' } });
  });

  test('blank rows are dropped, and the rest are renumbered', () => {
    const draft = scenario7Draft();
    const check = checkSetup(
      { ...draft, recipients: [draft.recipients[0], { ...draft.recipients[1], name: ' ', phone: '' }, draft.recipients[2]] },
      DEFAULT_SETTINGS,
      { hasPins: false }
    );
    if (!check.ok) throw new Error('expected a valid draft');
    expect(check.settings.recipients.map((r) => [r.name, r.order])).toEqual([
      ['Sam', 1],
      ['Front desk', 2],
    ]);
  });

  test('field errors land on the right row even after a blank row is dropped', () => {
    const draft = scenario7Draft();
    const [first, second, staff] = draft.recipients;
    const check = checkSetup(
      { ...draft, recipients: [first, { ...second, name: '', phone: '' }, { ...staff, phone: '416-555' }] },
      DEFAULT_SETTINGS,
      { hasPins: false }
    );
    expect(check).toEqual({
      ok: false,
      errors: { [rowFieldKey(ID_3, 'phone')]: 'Enter a full phone number, like 416 555 0123 or +44 20 7946 0958' },
    });
  });

  test('a row with a phone but no name asks for the name', () => {
    const draft = scenario7Draft();
    const check = checkSetup(
      { ...draft, recipients: [{ ...draft.recipients[0], name: '' }, ...draft.recipients.slice(1)] },
      DEFAULT_SETTINGS,
      { hasPins: false }
    );
    expect(check).toEqual({ ok: false, errors: { [rowFieldKey(ID_1, 'name')]: 'Enter a name' } });
  });

  test('the same number twice is marked on the later row', () => {
    const draft = scenario7Draft();
    const [first, second, staff] = draft.recipients;
    const check = checkSetup({ ...draft, recipients: [first, { ...second, phone: '+14165550101' }, staff] }, DEFAULT_SETTINGS, {
      hasPins: false,
    });
    expect(check).toEqual({ ok: false, errors: { [rowFieldKey(ID_2, 'phone')]: 'Same number as recipient 1' } });
  });

  test('needs at least one contact, not just venue staff', () => {
    const draft = scenario7Draft();
    const check = checkSetup({ ...draft, recipients: [draft.recipients[2]] }, DEFAULT_SETTINGS, { hasPins: false });
    expect(check).toEqual({ ok: false, errors: { recipients: 'Add at least one contact to text' } });
  });

  test('the wearer name, self-description and loudness target are checked', () => {
    const check = checkSetup(
      scenario7Draft({ wearerName: '  ', selfDescription: 'x'.repeat(201), loudnessTarget: '130' }),
      DEFAULT_SETTINGS,
      { hasPins: false }
    );
    expect(check).toEqual({
      ok: false,
      errors: {
        wearerName: 'Enter your name',
        selfDescription: 'Use 200 characters or fewer',
        loudnessTarget: 'Enter a level from 0 to 120 dB',
      },
    });
  });

  test('a blank or non-numeric loudness target is refused', () => {
    for (const loudnessTarget of ['', 'loud', '8 5']) {
      const check = checkSetup(scenario7Draft({ loudnessTarget }), DEFAULT_SETTINGS, { hasPins: false });
      expect(check).toEqual({ ok: false, errors: { loudnessTarget: 'Enter a level from 0 to 120 dB' } });
    }
  });

  test('names that are too long are refused', () => {
    const draft = scenario7Draft({ wearerName: 'x'.repeat(61) });
    const check = checkSetup(
      { ...draft, recipients: [{ ...draft.recipients[0], name: 'y'.repeat(61) }, ...draft.recipients.slice(1)] },
      DEFAULT_SETTINGS,
      { hasPins: false }
    );
    expect(check).toEqual({
      ok: false,
      errors: { wearerName: 'Use 60 characters or fewer', [rowFieldKey(ID_1, 'name')]: 'Use 60 characters or fewer' },
    });
  });

  test('keeps the fields the form does not edit (demo, teammate phone, bridge URL)', () => {
    const base: Settings = { ...DEFAULT_SETTINGS, demo: false, teammatePhone: '+14165550199', bridgeUrl: 'https://bridge.example' };
    const check = checkSetup(scenario7Draft(), base, { hasPins: false });
    if (!check.ok) throw new Error('expected a valid draft');
    expect(check.settings).toMatchObject({ demo: false, teammatePhone: '+14165550199', bridgeUrl: 'https://bridge.example' });
  });

  test('a problem in a field the form does not show is reported for the whole form', () => {
    const base = { ...DEFAULT_SETTINGS, bridgeUrl: 'ftp://nope' };
    const check = checkSetup(scenario7Draft(), base, { hasPins: false });
    expect(check).toEqual({ ok: false, errors: { form: 'bridgeUrl must be an http or https URL' } });
  });

  test('trims names and the self-description', () => {
    const draft = scenario7Draft({ wearerName: ' Alex ', selfDescription: ' Green jacket ' });
    const check = checkSetup(draft, DEFAULT_SETTINGS, { hasPins: false });
    if (!check.ok) throw new Error('expected a valid draft');
    expect(check.settings.wearerName).toBe('Alex');
    expect(check.settings.selfDescription).toBe('Green jacket');
  });

  test('the meeting spot is loaded, trimmed and saved', () => {
    expect(draftFromSettings({ ...DEFAULT_SETTINGS, meetingSpot: 'by the bar' }, { isSaved: true }).meetingSpot).toBe('by the bar');
    const check = checkSetup(scenario7Draft({ meetingSpot: '  left of the main stage ' }), DEFAULT_SETTINGS, { hasPins: false });
    if (!check.ok) throw new Error('expected a valid draft');
    expect(check.settings.meetingSpot).toBe('left of the main stage');
  });

  test('a meeting spot that is too long is marked on its field', () => {
    const check = checkSetup(scenario7Draft({ meetingSpot: 'x'.repeat(121) }), DEFAULT_SETTINGS, { hasPins: false });
    expect(check).toEqual({ ok: false, errors: { meetingSpot: 'Use 120 characters or fewer' } });
  });
});
