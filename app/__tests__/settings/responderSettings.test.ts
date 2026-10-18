// J15: the nearby-responder opt-in, from settings to the setup form to the Alert screen.
import type { RecipientStatus, Settings } from '../../modules/raveguard-native';
import { recipientRows } from '../../src/alert/alertModel';
import { DEFAULT_SETTINGS } from '../../src/settings/defaults';
import { validateSettings } from '../../src/settings/validateSettings';
import { checkSetup, draftFromSettings, type SetupDraft } from '../../src/setup/setupDraft';
import { stepOfErrorKey } from '../../src/setup/setupSteps';

const ON = { enabled: true as const, name: 'Riley', phoneE164: '+14165550199' };

describe('responder settings', () => {
  test('missing, null or switched off all read as off, and leave no field behind', () => {
    for (const responder of [undefined, null, { enabled: false }]) {
      const result = validateSettings({ ...DEFAULT_SETTINGS, responder });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.settings).not.toHaveProperty('responder');
    }
  });

  test('on keeps the name and number', () => {
    const result = validateSettings({ ...DEFAULT_SETTINGS, responder: ON });
    expect(result.ok && result.settings.responder).toEqual(ON);
  });

  test('on needs a name and an E.164 number', () => {
    const result = validateSettings({ ...DEFAULT_SETTINGS, responder: { enabled: true, name: ' ', phoneE164: '555' } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((issue) => issue.path).sort()).toEqual(['responder.name', 'responder.phoneE164']);
  });
});

describe('responder in the setup form', () => {
  const base: Settings = {
    ...DEFAULT_SETTINGS,
    wearerName: 'Alex',
    recipients: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Sam', phoneE164: '+14165550101', kind: 'contact', order: 1,
      permissions: { receiveAlerts: true, seeLocation: true, seeFullBrief: true, canResolve: true } }],
  };
  const draft = (overrides: Partial<SetupDraft> = {}): SetupDraft => ({ ...draftFromSettings(base, { isSaved: true }), ...overrides });

  test('starts off, and a saved opt-in comes back into the form', () => {
    expect(draft().responderEnabled).toBe(false);
    const saved = draftFromSettings({ ...base, responder: ON }, { isSaved: true });
    expect(saved).toMatchObject({ responderEnabled: true, responderName: 'Riley', responderPhone: '+14165550199' });
  });

  test('switching it on saves a normalized number; switching it off removes it', () => {
    const on = checkSetup(draft({ responderEnabled: true, responderName: ' Riley ', responderPhone: '416 555 0199' }), base, { hasPins: true });
    expect(on.ok && on.settings.responder).toEqual(ON);
    const off = checkSetup(draft({ responderEnabled: false, responderName: 'Riley', responderPhone: '416 555 0199' }),
      { ...base, responder: ON }, { hasPins: true });
    expect(off.ok).toBe(true);
    if (off.ok) expect(off.settings).not.toHaveProperty('responder');
  });

  test('missing name or number is shown on step 3', () => {
    const result = checkSetup(draft({ responderEnabled: true, responderName: '', responderPhone: '12' }), base, { hasPins: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.responderName).toBe('Enter the name responders will see');
      expect(result.errors.responderPhone).toMatch(/full phone number/);
      expect(stepOfErrorKey('responderName')).toBe(2);
      expect(stepOfErrorKey('responderPhone')).toBe(2);
    }
  });
});

describe('nearby responders on the Alert screen', () => {
  test('a responder the server texted gets its own label', () => {
    const riley: RecipientStatus = { name: 'Riley', kind: 'nearby', notifiedAt: Date.parse('2026-10-17T05:42:30Z'), ackedAt: null };
    const [row] = recipientRows([riley]);
    expect(row.kindLabel).toBe('Nearby responder');
    expect(row.accessibilityLabel).toMatch(/^Riley, nearby responder\./);
  });
});
