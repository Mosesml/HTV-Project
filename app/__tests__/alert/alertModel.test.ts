import type { EscalationEvent, RecipientStatus } from '../../modules/raveguard-native';
import {
  alertHeading,
  alertPill,
  alertRecipients,
  alertSentAt,
  formatClockTime,
  recipientRows,
  sosTextedLine,
  summarizeAlert,
} from '../../src/alert/alertModel';
import { PHASES } from '../../test-utils/nativeMock';

// Local times, so the expected strings hold in any time zone.
const AT_0142 = new Date(2027, 0, 9, 1, 42, 5).getTime();
const AT_0143 = new Date(2027, 0, 9, 1, 43, 30).getTime();
const AT_2305 = new Date(2027, 0, 9, 23, 5, 0).getTime();

const SAM: RecipientStatus = { name: 'Sam', kind: 'contact', notifiedAt: AT_0142, ackedAt: null };
const RILEY: RecipientStatus = { name: 'Riley', kind: 'contact', notifiedAt: null, ackedAt: null };
const DOOR: RecipientStatus = { name: 'Door staff', kind: 'venueStaff', notifiedAt: null, ackedAt: null };

function escalation(change: Partial<EscalationEvent> = {}): EscalationEvent {
  return { state: 'notifying', recipients: [SAM, RILEY, DOOR], sosOpen: false, ...change };
}

describe('formatClockTime', () => {
  test('gives the local time as 24-hour HH:MM', () => {
    expect(formatClockTime(AT_0142)).toBe('01:42');
    expect(formatClockTime(AT_2305)).toBe('23:05');
  });
});

describe('summarizeAlert', () => {
  test('waits for the server while there is no escalation yet', () => {
    expect(summarizeAlert(PHASES.escalated, null)).toEqual({
      title: 'Alert sent',
      status: 'Waiting for the server…',
      tone: 'waiting',
      isSos: false,
      isOpen: true,
    });
  });

  test('pending: the texts are about to go out', () => {
    const summary = summarizeAlert(PHASES.escalated, escalation({ state: 'pending', recipients: [] }));
    expect(summary).toMatchObject({ title: 'Alert sent', tone: 'waiting', status: 'Sending the first text…' });
  });

  test('notifying: how many were texted and that nobody has answered yet', () => {
    expect(summarizeAlert(PHASES.escalated, escalation())).toMatchObject({
      title: 'Alert sent',
      tone: 'sending',
      status: 'Texted 1 of 3. Waiting for someone to acknowledge.',
    });
  });

  test('acknowledged: names who acknowledged', () => {
    const acked = escalation({
      state: 'acknowledged',
      recipients: [{ ...SAM, ackedAt: AT_0143 }, RILEY, DOOR],
    });
    expect(summarizeAlert(PHASES.escalated, acked)).toMatchObject({
      title: 'Alert acknowledged',
      tone: 'acknowledged',
      status: 'Sam acknowledged at 01:43. Help is on the way.',
      isSos: false,
    });
  });

  test('acknowledged by two names both', () => {
    const acked = escalation({
      state: 'acknowledged',
      recipients: [
        { ...SAM, ackedAt: AT_0143 },
        { ...RILEY, notifiedAt: AT_0142, ackedAt: AT_2305 },
      ],
    });
    expect(summarizeAlert(PHASES.escalated, acked).status).toBe('Sam and Riley acknowledged. Help is on the way.');
  });

  test('SOS from the phase', () => {
    expect(summarizeAlert(PHASES.sos, escalation())).toMatchObject({
      title: 'SOS',
      tone: 'sos',
      isSos: true,
      isOpen: true,
      status: 'Nobody has acknowledged. Call for help now.',
    });
  });

  test('SOS from sosOpen, even before the phase catches up', () => {
    expect(summarizeAlert(PHASES.escalated, escalation({ sosOpen: true }))).toMatchObject({ title: 'SOS', isSos: true });
  });

  test('resolved and cancelled close the alert', () => {
    expect(summarizeAlert(PHASES.monitoring, escalation({ state: 'resolved' }))).toMatchObject({
      title: 'Alert resolved',
      tone: 'closed',
      status: 'Marked resolved. You can go back to your session.',
      isOpen: false,
      isSos: false,
    });
    expect(summarizeAlert(PHASES.monitoring, escalation({ state: 'cancelled' }))).toMatchObject({
      title: 'Alert cancelled',
      tone: 'closed',
      isOpen: false,
    });
  });

  test('a closed state wins over a stale sosOpen', () => {
    expect(summarizeAlert(PHASES.monitoring, escalation({ state: 'resolved', sosOpen: true }))).toMatchObject({
      isSos: false,
      title: 'Alert resolved',
    });
  });

  test('is not open before the first phase arrives', () => {
    expect(summarizeAlert(null, null).isOpen).toBe(false);
  });
});

describe('recipientRows', () => {
  test('one row per recipient in texting order, with the kind and when they were texted', () => {
    expect(recipientRows([SAM, RILEY, DOOR])).toEqual([
      {
        key: 'contact:Sam:0',
        name: 'Sam',
        kindLabel: 'Contact',
        textedLabel: 'Texted 01:42',
        replyLabel: 'No reply yet',
        isTexted: true,
        isAcked: false,
        accessibilityLabel: 'Sam, contact. Texted 01:42. No reply yet.',
      },
      {
        key: 'contact:Riley:1',
        name: 'Riley',
        kindLabel: 'Contact',
        textedLabel: 'Not texted yet',
        replyLabel: null,
        isTexted: false,
        isAcked: false,
        accessibilityLabel: 'Riley, contact. Not texted yet.',
      },
      {
        key: 'venueStaff:Door staff:2',
        name: 'Door staff',
        kindLabel: 'Venue staff',
        textedLabel: 'Not texted yet',
        replyLabel: null,
        isTexted: false,
        isAcked: false,
        accessibilityLabel: 'Door staff, venue staff. Not texted yet.',
      },
    ]);
  });

  test('shows when a recipient acknowledged', () => {
    const [row] = recipientRows([{ ...SAM, ackedAt: AT_0143 }]);
    expect(row).toMatchObject({
      replyLabel: 'Acknowledged 01:43',
      isAcked: true,
      accessibilityLabel: 'Sam, contact. Texted 01:42. Acknowledged 01:43.',
    });
  });

  test('keeps two recipients with the same name apart', () => {
    const keys = recipientRows([SAM, SAM]).map((row) => row.key);
    expect(new Set(keys).size).toBe(2);
  });
});

describe('alertRecipients (the redesigned rows)', () => {
  test('nothing to list before the first escalation', () => {
    expect(alertRecipients(null)).toEqual([]);
  });

  test('texted without a reply, then next in line while nobody has acknowledged', () => {
    expect(alertRecipients(escalation())).toEqual([
      {
        key: 'contact:Sam:0',
        index: 0,
        name: 'Sam',
        detail: 'Texted 01:42',
        state: 'noReply',
        statusLabel: 'No reply',
        accessibilityLabel: 'Sam, contact. Texted 01:42. No reply yet.',
      },
      {
        key: 'contact:Riley:1',
        index: 1,
        name: 'Riley',
        detail: 'Next if no one replies',
        state: 'notTexted',
        statusLabel: 'Not texted',
        accessibilityLabel: 'Riley, contact. Not texted yet. Next if no one replies.',
      },
      {
        key: 'venueStaff:Door staff:2',
        index: 2,
        name: 'Door staff',
        detail: 'Next if no one replies',
        state: 'notTexted',
        statusLabel: 'Not texted',
        accessibilityLabel: 'Door staff, venue staff. Not texted yet. Next if no one replies.',
      },
    ]);
  });

  test('once someone acknowledges they are on it, and everyone not yet texted is on hold behind them', () => {
    const rows = alertRecipients(
      escalation({
        state: 'acknowledged',
        recipients: [SAM, { ...RILEY, notifiedAt: AT_0142, ackedAt: AT_0143 }, DOOR],
      })
    );
    expect(rows.map((row) => [row.name, row.statusLabel, row.detail])).toEqual([
      ['Sam', 'No reply', 'Texted 01:42'],
      ['Riley', 'On it', 'Texted 01:42'],
      ['Door staff', 'Not texted', 'On hold while Riley responds'],
    ]);
    expect(rows[1].accessibilityLabel).toBe('Riley, contact. Texted 01:42. On it, acknowledged 01:43.');
    expect(rows[2].accessibilityLabel).toBe('Door staff, venue staff. Not texted yet. On hold while Riley responds.');
  });

  test('a closed alert says nobody else is needed', () => {
    const [, riley] = alertRecipients(escalation({ state: 'resolved' }));
    expect(riley.detail).toBe('Not needed');
  });

  test('keeps two recipients with the same name apart', () => {
    const keys = alertRecipients(escalation({ recipients: [SAM, SAM] })).map((row) => row.key);
    expect(new Set(keys).size).toBe(2);
  });
});

describe('alertSentAt and alertPill', () => {
  test('the alert went out with the first text', () => {
    expect(alertSentAt(null)).toBeNull();
    expect(alertSentAt(escalation({ recipients: [RILEY] }))).toBeNull();
    expect(alertSentAt(escalation({ recipients: [{ ...RILEY, notifiedAt: AT_2305 }, SAM] }))).toBe(AT_0142);
  });

  test('"Alert sent · HH:MM" in coral once a text is out, without the time before', () => {
    const sending = escalation();
    expect(alertPill(summarizeAlert(PHASES.escalated, sending), sending)).toEqual({ label: 'Alert sent · 01:42', tone: 'alert' });
    expect(alertPill(summarizeAlert(PHASES.escalated, null), null)).toEqual({ label: 'Alert sent', tone: 'alert' });
  });

  test('SOS, acknowledged and closed alerts', () => {
    const sos = escalation({ sosOpen: true });
    expect(alertPill(summarizeAlert(PHASES.escalated, sos), sos)).toEqual({ label: 'SOS', tone: 'alert' });
    const acked = escalation({ state: 'acknowledged', recipients: [{ ...SAM, ackedAt: AT_0143 }] });
    expect(alertPill(summarizeAlert(PHASES.escalated, acked), acked)).toEqual({ label: 'Alert acknowledged', tone: 'live' });
    const resolved = escalation({ state: 'resolved' });
    expect(alertPill(summarizeAlert(PHASES.monitoring, resolved), resolved)).toEqual({ label: 'Alert resolved', tone: 'neutral' });
  });
});

describe('alertHeading', () => {
  test('one heading per state', () => {
    expect(alertHeading(summarizeAlert(PHASES.escalated, null))).toBe('Texting your people');
    expect(alertHeading(summarizeAlert(PHASES.escalated, escalation()))).toBe('Your people have been texted');
    expect(alertHeading(summarizeAlert(PHASES.sos, escalation()))).toBe('Your people have been texted');
    expect(alertHeading(summarizeAlert(PHASES.escalated, escalation({ state: 'acknowledged' })))).toBe('Someone is on it');
    expect(alertHeading(summarizeAlert(PHASES.monitoring, escalation({ state: 'cancelled' })))).toBe('The alert is closed');
  });
});

describe('sosTextedLine', () => {
  test('names everyone who was texted, then asks for a call', () => {
    const all = escalation({
      recipients: [SAM, { ...RILEY, notifiedAt: AT_0142 }, { ...DOOR, notifiedAt: AT_0143 }],
    });
    expect(sosTextedLine(all)).toBe('Sam, Riley and Door staff were all texted. Call for help if you can.');
    expect(sosTextedLine(escalation())).toBe('Sam was texted. Call for help if you can.');
  });

  test('falls back to "your people" with nobody known', () => {
    expect(sosTextedLine(null)).toBe('Your people were texted. Call for help if you can.');
    expect(sosTextedLine(escalation({ recipients: [RILEY] }))).toBe('Your people were texted. Call for help if you can.');
  });
});
