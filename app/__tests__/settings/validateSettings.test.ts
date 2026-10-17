import type { Recipient, Settings } from '../../modules/raveguard-native';
import { DEFAULT_SETTINGS, MAX_MEETING_SPOT_LENGTH } from '../../src/settings/defaults';
import {
  assertValidSettings,
  SettingsValidationError,
  validateSettings,
} from '../../src/settings/validateSettings';

const SAM: Recipient = {
  id: '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b',
  name: 'Sam',
  phoneE164: '+14165550123',
  kind: 'contact',
  order: 1,
  permissions: { receiveAlerts: true, seeLocation: true, seeFullBrief: true, canResolve: true },
};

const STAFF: Recipient = {
  id: 'A1B2C3D4-E5F6-4711-8899-AABBCCDDEEFF',
  name: 'Venue staff',
  phoneE164: '+14165550199',
  kind: 'venueStaff',
  order: 2,
  permissions: { receiveAlerts: true, seeLocation: true, seeFullBrief: false, canResolve: false },
};

const VALID: Settings = {
  wearerName: 'Alex',
  selfDescription: 'black hoodie, white cap',
  recipients: [SAM, STAFF],
  intervalMin: 60,
  loudnessTarget: 90,
  demo: false,
  teammatePhone: '+14165550100',
  bridgeUrl: 'http://192.168.1.20:8080',
  meetingSpot: 'left of the main stage',
};

/** The issues for `input`, as "path message" strings. */
function issuesFor(input: unknown): string[] {
  const result = validateSettings(input);
  return result.ok ? [] : result.issues.map((issue) => `${issue.path} ${issue.message}`);
}

function withRecipient(changes: Record<string, unknown>): unknown {
  return { ...VALID, recipients: [{ ...SAM, ...changes }, STAFF] };
}

describe('validateSettings: the meeting spot (UI redesign)', () => {
  test('is optional: missing or null reads as empty, so older saved files still load', () => {
    const { meetingSpot: _dropped, ...withoutSpot } = VALID;
    expect(validateSettings(withoutSpot)).toEqual({ ok: true, settings: { ...VALID, meetingSpot: '' } });
    expect(validateSettings({ ...VALID, meetingSpot: null })).toEqual({ ok: true, settings: { ...VALID, meetingSpot: '' } });
    expect(issuesFor({ ...VALID, meetingSpot: '' })).toEqual([]);
  });

  test('is at most 120 characters and must be a string', () => {
    expect(issuesFor({ ...VALID, meetingSpot: 'x'.repeat(MAX_MEETING_SPOT_LENGTH) })).toEqual([]);
    expect(issuesFor({ ...VALID, meetingSpot: 'x'.repeat(MAX_MEETING_SPOT_LENGTH + 1) })).toEqual([
      `meetingSpot must be ${MAX_MEETING_SPOT_LENGTH} characters or fewer (got ${MAX_MEETING_SPOT_LENGTH + 1})`,
    ]);
    expect(issuesFor({ ...VALID, meetingSpot: 42 })).toEqual(['meetingSpot must be a string']);
  });
});

describe('validateSettings: accepts what Swift accepts', () => {
  test('a full, valid settings object passes unchanged', () => {
    const result = validateSettings(VALID);
    expect(result).toEqual({ ok: true, settings: VALID });
  });

  test('the defaults are valid, so a fresh install can start a session', () => {
    expect(validateSettings(DEFAULT_SETTINGS).ok).toBe(true);
  });

  test('null teammate phone and bridge URL, no recipients and an empty self-description pass', () => {
    const minimal = { ...VALID, recipients: [], teammatePhone: null, bridgeUrl: null, selfDescription: '' };
    expect(issuesFor(minimal)).toEqual([]);
  });

  test('loudness edges 0 and 120 and a fractional value pass', () => {
    expect(issuesFor({ ...VALID, loudnessTarget: 0 })).toEqual([]);
    expect(issuesFor({ ...VALID, loudnessTarget: 120 })).toEqual([]);
    expect(issuesFor({ ...VALID, loudnessTarget: 87.5 })).toEqual([]);
  });

  test('an https bridge URL with a path passes', () => {
    expect(issuesFor({ ...VALID, bridgeUrl: 'https://bridge.example.com/api' })).toEqual([]);
  });

  test('returns a copy holding only the Settings fields, so stray keys never reach Swift', () => {
    const result = validateSettings({ ...VALID, pin: '1111', recipients: [{ ...SAM, note: 'x' }, STAFF] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settings).toEqual(VALID);
    expect(result.settings).not.toBe(VALID);
    expect(Object.keys(result.settings.recipients[0])).not.toContain('note');
  });
});

describe('validateSettings: rejects what Swift would reject, with a clear path and reason', () => {
  test('non-objects are rejected', () => {
    expect(issuesFor(null)).toEqual(['settings must be an object']);
    expect(issuesFor('settings')).toEqual(['settings must be an object']);
    expect(issuesFor([])).toEqual(['settings must be an object']);
  });

  test('a blank wearer name', () => {
    expect(issuesFor({ ...VALID, wearerName: '   ' })).toEqual(['wearerName must not be blank']);
  });

  test('a missing field says it is missing', () => {
    const { wearerName: _dropped, ...rest } = VALID;
    expect(issuesFor(rest)).toEqual(['wearerName must be a string']);
  });

  test('an interval other than 30 or 60', () => {
    expect(issuesFor({ ...VALID, intervalMin: 45 })).toEqual(['intervalMin must be 30 or 60 (got 45)']);
  });

  test('loudness outside 0–120 dB or not a number', () => {
    expect(issuesFor({ ...VALID, loudnessTarget: 121 })).toEqual([
      'loudnessTarget must be between 0 and 120 dB (got 121)',
    ]);
    expect(issuesFor({ ...VALID, loudnessTarget: -1 })).toEqual([
      'loudnessTarget must be between 0 and 120 dB (got -1)',
    ]);
    expect(issuesFor({ ...VALID, loudnessTarget: Number.NaN })).toEqual(['loudnessTarget must be a number']);
    expect(issuesFor({ ...VALID, loudnessTarget: '85' })).toEqual(['loudnessTarget must be a number']);
  });

  test('demo must be a boolean', () => {
    expect(issuesFor({ ...VALID, demo: 1 })).toEqual(['demo must be true or false']);
  });

  test('a teammate phone that is not E.164', () => {
    expect(issuesFor({ ...VALID, teammatePhone: '416-555-0123' })).toEqual([
      'teammatePhone must be an E.164 phone number like +14165550123 (got 416-555-0123)',
    ]);
  });

  test('a bridge URL that is not http or https', () => {
    expect(issuesFor({ ...VALID, bridgeUrl: 'ftp://192.168.1.20' })).toEqual([
      'bridgeUrl must be an http or https URL',
    ]);
    expect(issuesFor({ ...VALID, bridgeUrl: 'http://' })).toEqual(['bridgeUrl must be an http or https URL']);
  });

  test('an overlong self-description (it goes into a 300-character SMS)', () => {
    expect(issuesFor({ ...VALID, selfDescription: 'x'.repeat(201) })).toEqual([
      'selfDescription must be 200 characters or fewer (got 201)',
    ]);
  });

  test('recipients must be an array of objects', () => {
    expect(issuesFor({ ...VALID, recipients: 'Sam' })).toEqual(['recipients must be an array']);
    expect(issuesFor({ ...VALID, recipients: [42] })).toEqual(['recipients[0] must be an object']);
  });

  test('a recipient id that is not a UUID', () => {
    expect(issuesFor(withRecipient({ id: 'sam' }))).toEqual(['recipients[0].id must be a UUID']);
  });

  test('a blank recipient name', () => {
    expect(issuesFor(withRecipient({ name: '' }))).toEqual(['recipients[0].name must not be blank']);
  });

  test('a recipient phone Swift would refuse (no plus, leading zero, too short)', () => {
    expect(issuesFor(withRecipient({ phoneE164: '4165550123' }))).toHaveLength(1);
    expect(issuesFor(withRecipient({ phoneE164: '+04165550123' }))).toHaveLength(1);
    expect(issuesFor(withRecipient({ phoneE164: '+1234567' }))).toEqual([
      'recipients[0].phoneE164 must be an E.164 phone number like +14165550123 (got +1234567)',
    ]);
  });

  test('an unknown recipient kind', () => {
    expect(issuesFor(withRecipient({ kind: 'friend' }))).toEqual([
      'recipients[0].kind must be contact or venueStaff (got friend)',
    ]);
  });

  test('every permission must be a boolean', () => {
    expect(issuesFor(withRecipient({ permissions: { ...SAM.permissions, seeLocation: 'yes' } }))).toEqual([
      'recipients[0].permissions.seeLocation must be true or false',
    ]);
    expect(issuesFor(withRecipient({ permissions: undefined }))).toEqual([
      'recipients[0].permissions must be an object',
    ]);
  });

  test('order must follow the list: the first recipient is order 1, the next 2, and so on', () => {
    const swapped = { ...VALID, recipients: [{ ...SAM, order: 2 }, { ...STAFF, order: 1 }] };
    expect(issuesFor(swapped)).toEqual([
      'recipients[0].order must be 1 (recipients are kept in texting order; got 2)',
      'recipients[1].order must be 2 (recipients are kept in texting order; got 1)',
    ]);
  });

  test('duplicate ids and duplicate phone numbers', () => {
    const twin = { ...STAFF, id: SAM.id, phoneE164: SAM.phoneE164 };
    expect(issuesFor({ ...VALID, recipients: [SAM, twin] })).toEqual([
      'recipients[1].id is the same as recipients[0].id',
      'recipients[1].phoneE164 is the same number as recipients[0]',
    ]);
  });

  test('reports every problem at once, so a form can mark all of them', () => {
    expect(issuesFor({ ...VALID, wearerName: '', intervalMin: 15, demo: 'no' })).toEqual([
      'wearerName must not be blank',
      'intervalMin must be 30 or 60 (got 15)',
      'demo must be true or false',
    ]);
  });
});

describe('assertValidSettings', () => {
  test('returns the clean copy when valid', () => {
    expect(assertValidSettings(VALID)).toEqual(VALID);
  });

  test('throws a SettingsValidationError listing the issues', () => {
    expect.assertions(3);
    try {
      assertValidSettings({ ...VALID, wearerName: '', intervalMin: 15 });
    } catch (error) {
      expect(error).toBeInstanceOf(SettingsValidationError);
      expect((error as SettingsValidationError).issues).toHaveLength(2);
      expect((error as Error).message).toBe(
        'Settings not saved: wearerName must not be blank; intervalMin must be 30 or 60 (got 15)'
      );
    }
  });
});
