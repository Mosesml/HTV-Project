import type { Settings } from '../../modules/raveguard-native';
import { DEFAULT_PERMISSIONS, DEFAULT_SETTINGS } from '../../src/settings/defaults';
import {
  addRecipient,
  createRecipient,
  moveRecipient,
  normalizePhone,
  removeRecipient,
  setRecipientPermission,
  updateRecipient,
} from '../../src/settings/recipients';
import { validateSettings } from '../../src/settings/validateSettings';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Ids "00000000-0000-4000-8000-00000000000N", in order, so tests can name them. */
function sequentialIds(): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `00000000-0000-4000-8000-${String(next).padStart(12, '0')}`;
  };
}

function threeRecipients(): Settings {
  const newId = sequentialIds();
  const one = addRecipient(DEFAULT_SETTINGS, { name: 'Sam', phone: '+14165550101', kind: 'contact' }, newId);
  const two = addRecipient(one, { name: 'Riley', phone: '+14165550102', kind: 'contact' }, newId);
  return addRecipient(two, { name: 'Front desk', phone: '+14165550103', kind: 'venueStaff' }, newId);
}

const names = (settings: Settings) => settings.recipients.map((r) => `${r.order}:${r.name}`);
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('normalizePhone', () => {
  test('keeps an E.164 number as it is', () => {
    expect(normalizePhone('+14165550123')).toBe('+14165550123');
  });

  test('strips spaces, dashes, dots and brackets', () => {
    expect(normalizePhone(' +1 (416) 555-01.23 ')).toBe('+14165550123');
  });

  test('turns a 10-digit North American number into +1', () => {
    expect(normalizePhone('416-555-0123')).toBe('+14165550123');
  });

  test('turns an 11-digit number starting with 1 into +1', () => {
    expect(normalizePhone('1 416 555 0123')).toBe('+14165550123');
  });

  test('leaves anything else for validation to reject', () => {
    expect(normalizePhone('555-0123')).toBe('5550123');
  });
});

describe('createRecipient', () => {
  test('generates a version 4 UUID by default', () => {
    const recipient = createRecipient({ name: 'Sam', phone: '+14165550101', kind: 'contact' }, 1);
    expect(recipient.id).toMatch(UUID);
  });

  test('two recipients never share an id', () => {
    const draft = { name: 'Sam', phone: '+14165550101', kind: 'contact' } as const;
    expect(createRecipient(draft, 1).id).not.toBe(createRecipient(draft, 1).id);
  });

  test('trims the name, normalizes the phone and uses shared contact defaults', () => {
    const recipient = createRecipient({ name: '  Sam ', phone: '(416) 555-0101', kind: 'contact' }, 2, () => ID(9));
    expect(recipient).toEqual({
      id: ID(9),
      name: 'Sam',
      phoneE164: '+14165550101',
      kind: 'contact',
      order: 2,
      permissions: DEFAULT_PERMISSIONS,
    });
  });

  test('contact defaults share alerts, location and details, with resolve off', () => {
    expect(DEFAULT_PERMISSIONS).toEqual({
      receiveAlerts: true,
      seeLocation: true,
      seeFullBrief: true,
      canResolve: false,
    });
  });

  test('takes explicit permissions over the defaults', () => {
    const recipient = createRecipient(
      { name: 'Front desk', phone: '+14165550103', kind: 'venueStaff', permissions: { seeLocation: true } },
      1
    );
    expect(recipient.permissions).toEqual({ ...DEFAULT_PERMISSIONS, seeLocation: true });
  });
});

describe('editing recipients returns new settings and keeps order 1, 2, 3…', () => {
  test('addRecipient appends in texting order', () => {
    const settings = threeRecipients();
    expect(names(settings)).toEqual(['1:Sam', '2:Riley', '3:Front desk']);
    expect(validateSettings(settings).ok).toBe(true);
  });

  test('addRecipient does not change the settings it was given', () => {
    const before = threeRecipients();
    const snapshot = JSON.stringify(before);
    addRecipient(before, { name: 'Jo', phone: '+14165550104', kind: 'contact' });
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  test('moveRecipient moves one recipient and renumbers the rest', () => {
    const moved = moveRecipient(threeRecipients(), ID(3), 0);
    expect(names(moved)).toEqual(['1:Front desk', '2:Sam', '3:Riley']);
    expect(validateSettings(moved).ok).toBe(true);
  });

  test('moveRecipient to its own place is a no-op copy', () => {
    const settings = threeRecipients();
    expect(names(moveRecipient(settings, ID(2), 1))).toEqual(names(settings));
  });

  test('moveRecipient refuses a position outside the list', () => {
    expect(() => moveRecipient(threeRecipients(), ID(1), 3)).toThrow(
      'moveRecipient: position must be from 0 to 2 (got 3)'
    );
  });

  test('removeRecipient closes the gap in the order', () => {
    const removed = removeRecipient(threeRecipients(), ID(1));
    expect(names(removed)).toEqual(['1:Riley', '2:Front desk']);
  });

  test('updateRecipient changes name, phone or kind and keeps the id and order', () => {
    const updated = updateRecipient(threeRecipients(), ID(2), { name: ' Riley K ', phone: '416 555 0199' });
    expect(updated.recipients[1]).toMatchObject({
      id: ID(2),
      order: 2,
      name: 'Riley K',
      phoneE164: '+14165550199',
      kind: 'contact',
    });
  });

  test('setRecipientPermission flips one permission of one recipient', () => {
    const updated = setRecipientPermission(threeRecipients(), ID(3), 'seeLocation', false);
    expect(updated.recipients[2].permissions).toEqual({ ...DEFAULT_PERMISSIONS, seeLocation: false });
    expect(updated.recipients[0].permissions).toEqual(DEFAULT_PERMISSIONS);
  });

  test('an unknown recipient id is an error, not a silent no-op', () => {
    const settings = threeRecipients();
    expect(() => removeRecipient(settings, 'missing')).toThrow('No recipient with id missing');
    expect(() => updateRecipient(settings, 'missing', { name: 'x' })).toThrow('No recipient with id missing');
    expect(() => setRecipientPermission(settings, 'missing', 'canResolve', false)).toThrow(
      'No recipient with id missing'
    );
    expect(() => moveRecipient(settings, 'missing', 0)).toThrow('No recipient with id missing');
  });
});
