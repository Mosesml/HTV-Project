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

export function renderSms({ recipient, kind, wearerName, at, triggerKind, promptsUnanswered, contactUrl }) {
  const permissions = recipient?.permissions;
  if (permissions?.receiveAlerts === false) return null;
  if (permissions?.receiveAlerts !== true || typeof permissions.seeFullBrief !== 'boolean') throw Error('Explicit recipient permissions required');
  if (!['normal', 'reduced', 'duress', 'all-clear'].includes(kind)) throw Error('Unknown SMS kind');
  const date = new Date(at);
  if (typeof at !== 'string' || !Number.isFinite(date.getTime())) throw Error('Invalid message time');
  const time = date.toISOString().slice(11, 16) + ' UTC';
  if (kind !== 'all-clear') {
    const url = new URL(contactUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
        !/^\/a\/[A-Za-z0-9_-]{22,64}$/.test(url.pathname) || contactUrl.length > 120 || url.href !== contactUrl)
      throw Error('Expected a short HTTPS recipient link');
  }
  if (typeof wearerName !== 'string' || !wearerName.trim()) throw Error('Wearer name required');
  const cleanName = wearerName.replace(/[\p{Cc}\p{Cf}]/gu, '').trim();
  const names = [Array.from(cleanName).slice(0, 100).join(''), Array.from(cleanName).slice(0, 16).join(''), 'The wearer'];
  const reduced = kind === 'reduced' || (kind === 'normal' && !permissions.seeFullBrief);
  const trigger = { fall: 'Fall detected', stillness: 'Stillness detected', scheduled: 'Scheduled check-in', manual: 'Safety check-in' }[triggerKind] ?? 'Safety check-in';
  const count = Number.isInteger(promptsUnanswered) && promptsUnanswered >= 0 && promptsUnanswered <= 1000 ? promptsUnanswered : 0;
  for (const name of names) {
    let body;
    if (kind === 'duress') body = `RaveGuard URGENT: ${name} signalled for help. Do not call or text them openly. ${contactUrl}`;
    else if (kind === 'all-clear') body = `RaveGuard: ${name} checked in at ${time}. No action needed.`;
    else if (reduced) body = `RaveGuard: ${name} missed a safety check-in at ${time}. Details: ${contactUrl}`;
    else body = `RaveGuard: ${name} may need help. ${trigger} at ${time}; ${count} prompts unanswered. Details: ${contactUrl}`;
    if (fits(body)) return body;
  }
  // Keep the link intact and fail closed rather than silently cutting critical instructions.
  throw Error('SMS cannot fit the two-segment budget');
}
