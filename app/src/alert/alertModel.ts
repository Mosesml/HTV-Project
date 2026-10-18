import type { EscalationEvent, PhaseEvent, RecipientStatus, StatusRecipientKind } from '../../modules/raveguard-native';

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

const KIND_LABELS: Record<StatusRecipientKind, string> = { contact: 'Contact', venueStaff: 'Venue staff', nearby: 'Nearby responder' };
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

// MARK: The redesigned Alert and SOS screens (docs/design/screens/Alert.html, SOS.html)

/** What a recipient row's status word says: acknowledged, texted without a reply, or not texted. */
export type RecipientState = 'onIt' | 'noReply' | 'notTexted';

export interface AlertRecipient {
  key: string;
  /** Texting order, 0 = texted first; picks the Avatar colour. */
  index: number;
  name: string;
  /** The line under the name: "Texted 01:47", "On hold while Theo responds", "Next if no one replies", "Not needed". */
  detail: string;
  state: RecipientState;
  /** The status word on the right: "On it", "No reply", "Not texted". */
  statusLabel: string;
  /** The whole row as VoiceOver reads it. */
  accessibilityLabel: string;
}

const STATUS_LABELS: Record<RecipientState, string> = { onIt: 'On it', noReply: 'No reply', notTexted: 'Not texted' };
const NEXT_IN_LINE = 'Next if no one replies';
const NOT_NEEDED = 'Not needed';

function notTextedDetail(acker: RecipientStatus | undefined, isClosed: boolean): string {
  // An acknowledgement stops the chain (PRD WEB-2), so later recipients wait on that person.
  if (acker !== undefined) return `On hold while ${acker.name} responds`;
  return isClosed ? NOT_NEEDED : NEXT_IN_LINE;
}

/**
 * The Alert screen's recipient rows, in texting order: who is on it, who hasn't replied, and
 * who is waiting their turn (on hold behind the first person who acknowledged).
 */
export function alertRecipients(escalation: EscalationEvent | null): AlertRecipient[] {
  if (escalation === null) return [];
  const isClosed = CLOSED_STATES.includes(escalation.state);
  const acker = escalation.recipients.find((recipient) => recipient.ackedAt !== null);
  return escalation.recipients.map((recipient, index) => {
    const kind = KIND_LABELS[recipient.kind].toLowerCase();
    if (recipient.notifiedAt === null) {
      const detail = notTextedDetail(acker, isClosed);
      return {
        key: `${recipient.kind}:${recipient.name}:${index}`,
        index,
        name: recipient.name,
        detail,
        state: 'notTexted',
        statusLabel: STATUS_LABELS.notTexted,
        accessibilityLabel: `${recipient.name}, ${kind}. Not texted yet. ${detail}.`,
      };
    }
    const detail = `Texted ${formatClockTime(recipient.notifiedAt)}`;
    const isAcked = recipient.ackedAt !== null;
    const spokenStatus = isAcked ? `On it, acknowledged ${formatClockTime(recipient.ackedAt as number)}` : 'No reply yet';
    const state: RecipientState = isAcked ? 'onIt' : 'noReply';
    return {
      key: `${recipient.kind}:${recipient.name}:${index}`,
      index,
      name: recipient.name,
      detail,
      state,
      statusLabel: STATUS_LABELS[state],
      accessibilityLabel: `${recipient.name}, ${kind}. ${detail}. ${spokenStatus}.`,
    };
  });
}

/** When the first text went out (epoch ms), or null before any did. */
export function alertSentAt(escalation: EscalationEvent | null): number | null {
  const times = (escalation?.recipients ?? [])
    .map((recipient) => recipient.notifiedAt)
    .filter((at): at is number => at !== null);
  return times.length === 0 ? null : Math.min(...times);
}

export type AlertPillTone = 'alert' | 'live' | 'neutral';

/** The pill at the top of Alert: "Alert sent · 01:47", "Alert acknowledged", "SOS", or the closed title. */
export function alertPill(summary: AlertSummary, escalation: EscalationEvent | null): { label: string; tone: AlertPillTone } {
  switch (summary.tone) {
    case 'sos':
      return { label: summary.title, tone: 'alert' };
    case 'acknowledged':
      return { label: summary.title, tone: 'live' };
    case 'closed':
      return { label: summary.title, tone: 'neutral' };
    case 'waiting':
    case 'sending': {
      const sentAt = alertSentAt(escalation);
      return { label: sentAt === null ? summary.title : `${summary.title} · ${formatClockTime(sentAt)}`, tone: 'alert' };
    }
  }
}

const HEADINGS: Record<AlertTone, string> = {
  waiting: 'Texting your people',
  sending: 'Your people have been texted',
  sos: 'Your people have been texted',
  acknowledged: 'Someone is on it',
  closed: 'The alert is closed',
};

/** Alert's big heading for the summary's tone. */
export function alertHeading(summary: AlertSummary): string {
  return HEADINGS[summary.tone];
}

const SOS_ASK = 'Call for help if you can.';

/** SOS's line under the heading: who was texted ("Maya, Theo and Door staff were all texted."), then the ask. */
export function sosTextedLine(escalation: EscalationEvent | null): string {
  const names = (escalation?.recipients ?? [])
    .filter((recipient) => recipient.notifiedAt !== null)
    .map((recipient) => recipient.name);
  if (names.length === 0) return `Your people were texted. ${SOS_ASK}`;
  if (names.length === 1) return `${names[0]} was texted. ${SOS_ASK}`;
  return `${joinNames(names)} were all texted. ${SOS_ASK}`;
}
