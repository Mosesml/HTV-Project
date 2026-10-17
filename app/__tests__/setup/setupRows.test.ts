import { DEFAULT_PERMISSIONS } from '../../src/settings/defaults';
import {
  appendRow,
  FIRST_CONTACT_PERMISSIONS,
  isBlankRow,
  moveRowDown,
  moveRowTo,
  moveRowUp,
  removeRow,
  rowsFromRecipients,
  setRowKind,
  setRowPermission,
  starterRows,
  updateRow,
  VENUE_STAFF_PERMISSIONS,
  withAlertsOn,
  type RecipientRow,
} from '../../src/setup/setupRows';

function counter(): () => string {
  let next = 0;
  return () => `row-${++next}`;
}

describe('starterRows', () => {
  test('are Contact 1, Contact 2 and venue staff, blank, with permissions that already fit scenario 7', () => {
    expect(starterRows(counter())).toEqual([
      { id: 'row-1', name: '', phone: '', kind: 'contact', permissions: FIRST_CONTACT_PERMISSIONS },
      { id: 'row-2', name: '', phone: '', kind: 'contact', permissions: DEFAULT_PERMISSIONS },
      { id: 'row-3', name: '', phone: '', kind: 'venueStaff', permissions: VENUE_STAFF_PERMISSIONS },
    ]);
    expect(FIRST_CONTACT_PERMISSIONS.seeLocation).toBe(true);
    expect(DEFAULT_PERMISSIONS.seeLocation).toBe(false);
    expect(VENUE_STAFF_PERMISSIONS.seeLocation).toBe(true);
  });
});

describe('rowsFromRecipients', () => {
  test('keeps ids, kinds and permissions, and shows phones as saved', () => {
    const rows = rowsFromRecipients([
      {
        id: 'a',
        name: 'Sam',
        phoneE164: '+14165550101',
        kind: 'contact',
        order: 1,
        permissions: DEFAULT_PERMISSIONS,
      },
    ]);
    expect(rows).toEqual([{ id: 'a', name: 'Sam', phone: '+14165550101', kind: 'contact', permissions: DEFAULT_PERMISSIONS }]);
  });
});

describe('row editing', () => {
  const rows = starterRows(counter());

  test('updateRow changes only that row and keeps the text as typed', () => {
    const next = updateRow(rows, 'row-2', { name: 'Riley ', phone: '(416) 555' });
    expect(next[1]).toMatchObject({ name: 'Riley ', phone: '(416) 555' });
    expect(next[0]).toBe(rows[0]);
    expect(rows[1].name).toBe('');
  });

  test('setRowPermission flips one permission', () => {
    const next = setRowPermission(rows, 'row-1', 'seeLocation', false);
    expect(next[0].permissions).toEqual({ ...FIRST_CONTACT_PERMISSIONS, seeLocation: false });
    expect(rows[0].permissions.seeLocation).toBe(true);
  });

  test('moveRowUp swaps a row with the one above, permissions travelling with it', () => {
    const next = moveRowUp(rows, 'row-2');
    expect(next.map((row) => row.id)).toEqual(['row-2', 'row-1', 'row-3']);
    expect(next[0].permissions).toEqual(DEFAULT_PERMISSIONS);
  });

  test('moveRowUp on the first row changes nothing', () => {
    expect(moveRowUp(rows, 'row-1')).toBe(rows);
  });

  test('removeRow drops the row', () => {
    expect(removeRow(rows, 'row-2').map((row) => row.id)).toEqual(['row-1', 'row-3']);
  });

  test('appendRow adds a blank contact or venue staff at the end', () => {
    const newId = () => 'row-new';
    expect(appendRow(rows, 'contact', newId)[3]).toEqual({
      id: 'row-new',
      name: '',
      phone: '',
      kind: 'contact',
      permissions: DEFAULT_PERMISSIONS,
    });
    expect(appendRow(rows, 'venueStaff', newId)[3].permissions).toEqual(VENUE_STAFF_PERMISSIONS);
  });

  test('the first contact added to an empty list gets the first-contact permissions', () => {
    expect(appendRow([], 'contact', () => 'only')[0].permissions).toEqual(FIRST_CONTACT_PERMISSIONS);
  });

  test('editing an unknown row is an error', () => {
    expect(() => updateRow(rows, 'nope', { name: 'x' })).toThrow('No recipient row with id nope');
  });
});

describe('isBlankRow', () => {
  const blank: RecipientRow = starterRows(counter())[0];

  test('is true only when both name and phone are blank', () => {
    expect(isBlankRow(blank)).toBe(true);
    expect(isBlankRow({ ...blank, name: '  ', phone: ' ' })).toBe(true);
    expect(isBlankRow({ ...blank, name: 'Sam' })).toBe(false);
    expect(isBlankRow({ ...blank, phone: '4165550101' })).toBe(false);
  });
});

describe('reordering for the redesigned step 1', () => {
  const rows = (): readonly RecipientRow[] => starterRows(counter()).map((row, i) => ({ ...row, name: `P${i + 1}` }));
  const names = (list: readonly RecipientRow[]) => list.map((row) => row.name);

  test('moveRowDown swaps a row with the one below, permissions travelling with it', () => {
    const before = rows();
    const after = moveRowDown(before, 'row-1');
    expect(names(after)).toEqual(['P2', 'P1', 'P3']);
    expect(after[1].permissions).toEqual(FIRST_CONTACT_PERMISSIONS);
    expect(names(before)).toEqual(['P1', 'P2', 'P3']);
  });

  test('moveRowDown on the last row changes nothing', () => {
    const before = rows();
    expect(moveRowDown(before, 'row-3')).toBe(before);
  });

  test('moveRowTo drags a row to any place, shifting the rows in between', () => {
    expect(names(moveRowTo(rows(), 'row-1', 2))).toEqual(['P2', 'P3', 'P1']);
    expect(names(moveRowTo(rows(), 'row-3', 0))).toEqual(['P3', 'P1', 'P2']);
    expect(names(moveRowTo(rows(), 'row-2', 9))).toEqual(['P1', 'P3', 'P2']);
    expect(names(moveRowTo(rows(), 'row-2', -4))).toEqual(['P2', 'P1', 'P3']);
  });

  test('moveRowTo its own place returns the same list', () => {
    const before = rows();
    expect(moveRowTo(before, 'row-2', 1)).toBe(before);
  });

  test('setRowKind changes contact or venue staff and keeps the permissions', () => {
    const after = setRowKind(rows(), 'row-2', 'venueStaff');
    expect(after[1]).toMatchObject({ kind: 'venueStaff', permissions: DEFAULT_PERMISSIONS });
  });

  test('withAlertsOn turns "Get alerts" back on and leaves the rest', () => {
    const before = setRowPermission(rows(), 'row-3', 'receiveAlerts', false);
    const after = withAlertsOn(before);
    expect(after.map((row) => row.permissions.receiveAlerts)).toEqual([true, true, true]);
    expect(after[2].permissions).toEqual(VENUE_STAFF_PERMISSIONS);
    expect(after[0]).toBe(before[0]);
    expect(before[2].permissions.receiveAlerts).toBe(false);
  });
});
