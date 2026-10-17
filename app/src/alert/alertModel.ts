import type { EscalationEvent, PhaseEvent, RecipientKind, RecipientStatus } from '../../modules/raveguard-native';

// What the Alert screen says (K10, PRD D10 / UI-5), as plain values so every rule is unit
// tested in __tests__/alert/alertModel.test.ts. The screen only lays these out.
//
// Swift never sends an escalation for a duress PIN (WORK_ORDER.md, the duress rule), so
// nothing here ever has one to describe.

export type AlertTone = 'waiting' | 'sending' | 'acknowledged' | 'closed' | 'sos';

export interface AlertSummary {
  title: string;
  /** One line under the title: what is happening now. */
  status: string;
  tone: AlertTone;
  /** Phase `sos`, or the server's `sosOpen`, and the alert isn't closed. */
  isSos: boolean;
  /** The session still has this alert open (phase `escalated` or `sos`). */
  isOpen: boolean;
}

export interface RecipientRow {
  key: string;
  name: string;
  kindLabel: string;
  /** "Texted 01:42" or "Not texted yet". */
  textedLabel: string;
  /** "Acknowledged 01:43", "No reply yet" once texted, or null before. */
  replyLabel: string | null;
  isTexted: boolean;
  isAcked: boolean;
  /** The whole row as VoiceOver reads it. */
  accessibilityLabel: string;
}

const KIND_LABELS: Record<RecipientKind, string> = { contact: 'Contact', venueStaff: 'Venue staff' };
const CLOSED_STATES: readonly EscalationEvent['state'][] = ['resolved', 'cancelled'];
const HELP_COMING = 'Help is on the way.';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Local 24-hour "HH:MM", the way the SMS briefs write times. */
export function formatClockTime(epochMs: number): string {
  const date = new Date(epochMs);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function acknowledgedStatus(recipients: readonly RecipientStatus[]): string {
  const acked = recipients.filter((recipient) => recipient.ackedAt !== null);
  if (acked.length === 0) return `Someone acknowledged. ${HELP_COMING}`;
  if (acked.length === 1) {
    const [only] = acked;
    return `${only.name} acknowledged at ${formatClockTime(only.ackedAt as number)}. ${HELP_COMING}`;
  }
  return `${joinNames(acked.map((recipient) => recipient.name))} acknowledged. ${HELP_COMING}`;
}

function notifyingStatus(recipients: readonly RecipientStatus[]): string {
  const texted = recipients.filter((recipient) => recipient.notifiedAt !== null).length;
  return `Texted ${texted} of ${recipients.length}. Waiting for someone to acknowledge.`;
}

/** The title and status line for the session's `phase` and the latest `escalation`. */
export function summarizeAlert(phase: PhaseEvent | null, escalation: EscalationEvent | null): AlertSummary {
  const isOpen = phase?.phase === 'escalated' || phase?.phase === 'sos';
  const isClosed = escalation !== null && CLOSED_STATES.includes(escalation.state);
  const isAcked = escalation?.state === 'acknowledged';
  const isSos = !isClosed && !isAcked && (phase?.phase === 'sos' || escalation?.sosOpen === true);

  if (isSos) {
    return { title: 'SOS', status: 'Nobody has acknowledged. Call for help now.', tone: 'sos', isSos, isOpen };
  }
  if (escalation === null) {
    return { title: 'Alert sent', status: 'Waiting for the server…', tone: 'waiting', isSos, isOpen };
  }
  switch (escalation.state) {
    case 'pending':
      return { title: 'Alert sent', status: 'Sending the first text…', tone: 'waiting', isSos, isOpen };
    case 'notifying':
      return { title: 'Alert sent', status: notifyingStatus(escalation.recipients), tone: 'sending', isSos, isOpen };
    case 'acknowledged':
      return {
        title: 'Alert acknowledged',
        status: acknowledgedStatus(escalation.recipients),
        tone: 'acknowledged',
        isSos,
        isOpen,
      };
    case 'resolved':
      return {
        title: 'Alert resolved',
        status: 'Marked resolved. You can go back to your session.',
        tone: 'closed',
        isSos,
        isOpen,
      };
    case 'cancelled':
      return {
        title: 'Alert cancelled',
        status: 'Nobody was texted. You can go back to your session.',
        tone: 'closed',
        isSos,
        isOpen,
      };
  }
}

function recipientRow(recipient: RecipientStatus, index: number): RecipientRow {
  const kindLabel = KIND_LABELS[recipient.kind];
  const isTexted = recipient.notifiedAt !== null;
  const isAcked = recipient.ackedAt !== null;
  const textedLabel = isTexted ? `Texted ${formatClockTime(recipient.notifiedAt as number)}` : 'Not texted yet';
  let replyLabel: string | null = null;
  if (isAcked) replyLabel = `Acknowledged ${formatClockTime(recipient.ackedAt as number)}`;
  else if (isTexted) replyLabel = 'No reply yet';
  const spoken = [textedLabel, replyLabel].filter((part): part is string => part !== null).join('. ');
  return {
    key: `${recipient.kind}:${recipient.name}:${index}`,
    name: recipient.name,
    kindLabel,
    textedLabel,
    replyLabel,
    isTexted,
    isAcked,
    accessibilityLabel: `${recipient.name}, ${kindLabel.toLowerCase()}. ${spoken}.`,
  };
}

/** One row per recipient, in the order the server texts them. */
export function recipientRows(recipients: readonly RecipientStatus[]): RecipientRow[] {
  return recipients.map(recipientRow);
}
