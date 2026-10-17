import type { EscalationEvent, RecipientStatus } from '../../modules/raveguard-native';
import { formatClockTime, recipientRows, summarizeAlert } from '../../src/alert/alertModel';
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
