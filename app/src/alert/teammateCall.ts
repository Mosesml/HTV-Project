import { Linking } from 'react-native';

import type { Settings } from '../../modules/raveguard-native';
import { E164_PATTERN } from '../settings/validateSettings';

// The Alert screen's Call button (K10, PRD DEM-1). RaveGuard never dials emergency
// services: in demo mode Call rings the teammate's number from settings, and outside demo
// mode it rings nobody. Swift's `SessionManagerConfig.sosDialNumber` applies the same rule.
//
// This is the only place in the app that builds a `tel:` URL, and only from a full E.164
// number (8 to 15 digits), so no short code can ever be dialled from here.
// __tests__/alert/noEmergencyNumbers.test.ts keeps it that way.

export type CallTarget =
  | { kind: 'ready'; phone: string; url: string }
  /** Not in demo mode: Call is off. */
  | { kind: 'notDemo' }
  /** Demo mode, but no usable teammate number saved. */
  | { kind: 'noNumber' };

/** `tel:<number>` for a full E.164 number, or null for anything else. */
export function telUrl(phone: string): string | null {
  return E164_PATTERN.test(phone) ? `tel:${phone}` : null;
}

/** Who Call would ring with these settings. */
export function callTarget({ demo, teammatePhone }: Pick<Settings, 'demo' | 'teammatePhone'>): CallTarget {
  if (!demo) return { kind: 'notDemo' };
  const url = teammatePhone === null ? null : telUrl(teammatePhone);
  if (teammatePhone === null || url === null) return { kind: 'noNumber' };
  return { kind: 'ready', phone: teammatePhone, url };
}

/**
 * Hands the call to iOS, which asks the wearer to confirm before dialling. Rejects on a phone
 * that can't call (the Simulator, an iPad).
 */
export async function startCall(target: Extract<CallTarget, { kind: 'ready' }>): Promise<void> {
  await Linking.openURL(target.url);
}
