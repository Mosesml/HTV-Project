import type { CheckInTrigger, Settings, TriggerKind } from '../../modules/raveguard-native';
import { formatClockTime } from './alertModel';

// What the phone can say about the alert from facts it has (Kean: the mockup's "What they were
// sent" card becomes a phone-side "Summary"). The texts themselves are written by the server and
// filtered per recipient, so this is a summary, never a quote, and it never claims a diagnosis
// (docs/design/README.md, rule 2): "may need help", "looked like a fall", "missed a check-in".
// The detector's sensor numbers stay out: they read as a medical finding to a stranger.

type Facts = Pick<Settings, 'wearerName' | 'selfDescription' | 'meetingSpot'>;

export const SUMMARY_FOOTNOTE = "Written on this phone. Each person's text depends on what they're allowed to see.";

const FALLBACK_NAME = 'The wearer';
const ENDS_A_SENTENCE = /[.!?]$/;

function displayName(wearerName: string): string {
  const name = wearerName.trim();
  return name === '' ? FALLBACK_NAME : name;
}

function asSentence(text: string): string {
  return ENDS_A_SENTENCE.test(text) ? text : `${text}.`;
}

function withoutFullStop(text: string): string {
  return text.replace(/\.+$/, '');
}

const WHAT_HAPPENED: Record<TriggerKind, (name: string, time: string) => string> = {
  fall: (name, time) => `It looked like a fall at ${time}, and ${name} missed the check-in.`,
  stillness: (name, time) => `${name} was still for a while before ${time} and missed the check-in.`,
  scheduled: (name, time) => `${name} missed a scheduled check-in at ${time}.`,
  manual: (name, time) => `${name} missed a check-in at ${time}.`,
};

function whatHappened(name: string, trigger: CheckInTrigger | null): string {
  if (trigger === null) return `${name} missed a check-in.`;
  const describe = WHAT_HAPPENED[trigger.kind] ?? WHAT_HAPPENED.manual;
  return describe(name, formatClockTime(trigger.at));
}

/**
 * The Summary card's text: who may need help, what started the check-in and when, then the
 * meeting spot and the wearer's own description when they are set.
 */
export function phoneSummary(facts: Facts, trigger: CheckInTrigger | null): string {
  const name = displayName(facts.wearerName);
  const spot = facts.meetingSpot.trim();
  const description = facts.selfDescription.trim();
  return [
    `${name} may need help.`,
    whatHappened(name, trigger),
    spot === '' ? null : asSentence(`Meeting spot: ${spot}`),
    description === '' ? null : asSentence(description),
  ]
    .filter((part): part is string => part !== null)
    .join(' ');
}

/**
 * SOS's "Read this out": where to find the wearer and what they have on, joined like the
 * mockup ("Main stage, left side · black hoodie, white cap"), or what to say with neither set.
 */
export function readThisOut(facts: Facts): string {
  const parts = [facts.meetingSpot, facts.selfDescription].map((part) => withoutFullStop(part.trim())).filter((part) => part !== '');
  if (parts.length > 0) return parts.join(' · ');
  const name = facts.wearerName.trim();
  return name === '' ? 'Say your name and where you are right now.' : `Say your name, ${name}, and where you are right now.`;
}
