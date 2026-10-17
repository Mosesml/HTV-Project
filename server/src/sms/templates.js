import { formatClock } from '../brief.js';

// GSM extension characters consume two septets; other characters select UTF-16/UCS-2.
const gsm = new Set(Array.from('@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'));
const extended = new Set(Array.from('\f^{}\\[~]|€'));
function packedSegments(weights, capacity) {
  let segments = 1, used = 0;
  for (const weight of weights) {
    if (used + weight > capacity) { segments++; used = 0; }
    used += weight;
  }
  return segments;
}
export function smsSegments(text) {
  const chars = Array.from(text);
  const weights = chars.map(char => gsm.has(char) ? 1 : extended.has(char) ? 2 : 0);
  if (weights.includes(0)) return text.length <= 70 ? 1 : packedSegments(chars.map(c => c.length), 67);
  const total = weights.reduce((sum, value) => sum + value, 0);
  return total <= 160 ? 1 : packedSegments(weights, 153);
}
const fits = text => text.length <= 300 && smsSegments(text) <= 2;

// Consumes an AN8 payload (brief.js `payloadFor`), never raw facts or recipient settings: whether this
// is the full, reduced or duress text was decided there, once, for SMS and page alike.
// `kind: 'all-clear'` is the one override; it needs only the wearer's name and `at`.
export function renderSms({ payload, kind, contactUrl, at }) {
  if (payload === null) return null;   // recipient opted out of alerts
  if (!payload || !['full', 'reduced'].includes(payload.variant) || !['normal', 'duress'].includes(payload.mode))
    throw Error('Brief payload required');
  if (kind !== undefined && kind !== 'all-clear') throw Error('Unknown SMS kind');
  const effective = kind ?? (payload.mode === 'duress' ? 'duress' : payload.variant === 'reduced' ? 'reduced' : 'normal');
  const offset = payload.utcOffsetMinutes ?? undefined;
  let allClearTime;
  if (effective === 'all-clear') {
    if (typeof at !== 'string' || !Number.isFinite(Date.parse(at))) throw Error('Invalid message time');
    allClearTime = formatClock(at, offset);
  } else {
    const url = new URL(contactUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
        !/^\/a\/[A-Za-z0-9_-]{22,64}$/.test(url.pathname) || contactUrl.length > 120 || url.href !== contactUrl)
      throw Error('Expected a short HTTPS recipient link');
  }
  if (typeof payload.wearerName !== 'string' || !payload.wearerName.trim()) throw Error('Wearer name required');
  const cleanName = payload.wearerName.replace(/[\p{Cc}\p{Cf}]/gu, '').trim();
  const names = [Array.from(cleanName).slice(0, 100).join(''), Array.from(cleanName).slice(0, 16).join(''), 'The wearer'];
  for (const name of names) {
    let body;
    if (effective === 'duress') body = `Guardian URGENT: ${name} signalled for help. Do not call or text them openly. ${contactUrl}`;
    else if (effective === 'all-clear') body = `Guardian: ${name} checked in at ${allClearTime}. No action needed.`;
    else if (effective === 'reduced') body = `Guardian: ${name} missed a safety check-in at ${payload.missedAt}. Details: ${contactUrl}`;
    else {
      const count = payload.promptsUnanswered;
      body = `Guardian: ${name} may need help. ${payload.trigger.label} at ${payload.trigger.at}; ${count} prompts unanswered. Details: ${contactUrl}`;
    }
    if (fits(body)) return body;
  }
  // Keep the link intact and fail closed rather than silently cutting critical instructions.
  throw Error('SMS cannot fit the two-segment budget');
}
