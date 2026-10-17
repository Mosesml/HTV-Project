// AN8: the one place that turns an escalation into something a recipient may see.
//
// `payloadFor` is the only code that reads a recipient's permissions or an escalation's facts for
// outbound use. SMS (sms/templates.js) and the contact page (AN11) consume its output, so the two
// can never disagree about who sees what. It builds the result field by field from scratch: a
// field added to BriefFacts later is invisible to every recipient until someone adds it here.

/** A phone whose last heartbeat is older than this at read time is reported as silent. */
export const SILENCE_MS = 20_000;

const TRIGGER_LABELS = { fall: 'Fall detected', stillness: 'Stillness detected',
  scheduled: 'Scheduled check-in', manual: 'Safety check-in' };
const STATES = new Set(['dancing', 'walking', 'still', 'fallen', 'unknown']);

/** HH:MM in the wearer's local time, or HH:MM UTC when the phone sent no offset. */
export function formatClock(value, offsetMinutes) {
  const ms = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(ms)) throw Error('Invalid time');
  const clock = new Date(ms + (offsetMinutes ?? 0) * 60_000).toISOString().slice(11, 16);
  return offsetMinutes === undefined ? `${clock} UTC` : clock;
}

// Free text comes from the phone: drop control and bidi/format characters, collapse whitespace,
// and cap by code points so nothing can smuggle markup layout or run past a template budget.
function clean(text, max) {
  const flat = String(text ?? '').replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim();
  const points = Array.from(flat);
  return points.length > max ? `${points.slice(0, max - 1).join('')}…` : flat;
}

function deepFreeze(value) {
  if (value && typeof value === 'object') Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

/**
 * @param recipient  { permissions: { receiveAlerts, seeLocation, seeFullBrief, canResolve } }
 * @param view       { facts, deadlineMs, duress, utcOffsetMinutes?, lastHeartbeatAt?, now? }
 * @returns null when the recipient opted out of alerts; otherwise a frozen payload.
 */
export function payloadFor(recipient, view) {
  const permissions = recipient?.permissions;
  if (permissions?.receiveAlerts === false) return null;
  if (permissions?.receiveAlerts !== true ||
      ['seeLocation', 'seeFullBrief', 'canResolve'].some(key => typeof permissions[key] !== 'boolean'))
    throw Error('Explicit recipient permissions required');
  const { facts } = view;
  const offset = Number.isInteger(view.utcOffsetMinutes) ? view.utcOffsetMinutes : undefined;
  const payload = {
    variant: permissions.seeFullBrief ? 'full' : 'reduced',
    mode: view.duress ? 'duress' : 'normal',
    wearerName: clean(facts.wearerName, 100) || 'The wearer',
    utcOffsetMinutes: offset ?? null,
    missedAt: formatClock(view.deadlineMs, offset),
    canResolve: permissions.canResolve
  };
  if (permissions.seeFullBrief) {
    const kind = Object.hasOwn(TRIGGER_LABELS, facts.trigger.kind) ? facts.trigger.kind : 'manual';
    const prompts = facts.promptsUnanswered;
    const beat = Date.parse(view.lastHeartbeatAt);
    payload.selfDescription = clean(facts.selfDescription, 200);
    payload.lastActive = {
      state: STATES.has(facts.lastActiveState) ? facts.lastActiveState : 'unknown',
      until: facts.lastActiveUntil ? formatClock(facts.lastActiveUntil, offset) : null };
    payload.trigger = { kind, label: TRIGGER_LABELS[kind], at: formatClock(facts.trigger.at, offset),
      reason: clean(facts.trigger.reason, 200) };
    payload.promptsUnanswered = Number.isInteger(prompts) && prompts >= 0 && prompts <= 1000 ? prompts : 0;
    payload.phoneSilentSince = Number.isFinite(beat) && Number.isFinite(view.now) && view.now - beat > SILENCE_MS
      ? formatClock(beat, offset) : null;
  }
  // AN10: whether this recipient gets the live location link at all, known before any fix arrives,
  // so the SMS sent at the deadline can carry the link even if the phone's first fix is still coming.
  if (permissions.seeLocation) payload.locationShared = true;
  if (permissions.seeLocation && facts.location) {
    const { lat, lon, accuracyM, at } = facts.location;
    payload.location = { lat, lon, accuracyM: Math.round(accuracyM), at: formatClock(at, offset),
      mapUrl: `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lon.toFixed(6)}` };
  }
  return deepFreeze(payload);
}

const STATE_WORDS = { dancing: 'dancing', walking: 'walking', still: 'still', fallen: 'down' };

/** Deterministic brief text. Location is deliberately absent: the page shows it separately. */
export function renderBrief(payload) {
  if (payload.variant === 'reduced') return `${payload.wearerName} missed a safety check-in at ${payload.missedAt}.`;
  const sentences = [];
  const who = payload.selfDescription ? `${payload.wearerName} (${payload.selfDescription})` : payload.wearerName;
  const { state, until } = payload.lastActive;
  sentences.push(state in STATE_WORDS ? `${who} was ${STATE_WORDS[state]}${until ? ` until ${until}` : ''}.` : `${who}.`);
  const { label, at, reason } = payload.trigger;
  sentences.push(`${label} at ${at}${reason ? `: ${reason}` : ''}.`);
  const n = payload.promptsUnanswered;
  if (n > 0) sentences.push(`${n} check-in ${n === 1 ? 'prompt' : 'prompts'} went unanswered.`);
  if (payload.phoneSilentSince) sentences.push(`Phone went silent at ${payload.phoneSilentSince}.`);
  return sentences.join(' ');
}
