// The teammate's number the demo SOS call rings (K10), as typed on the Debug screen.

/** Spaces, dashes, dots and brackets people type in phone numbers. */
const TYPED_SEPARATORS = /[\s\-.()]/g;

/** Null for a blank field; otherwise the number without separators, for validation to check. */
export function parseTeammatePhone(text: string): string | null {
  const compact = text.replace(TYPED_SEPARATORS, '');
  return compact === '' ? null : compact;
}
