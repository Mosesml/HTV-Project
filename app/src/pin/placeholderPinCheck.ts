import type { PinResultKind } from '../../modules/raveguard-native';

// Stand-in for the PIN gate (K6), from the PRD's FakePINVerifier (D2): 1111 is the safe PIN,
// 9999 the duress PIN, anything else is wrong. K6 replaces it with salted hashes in
// expo-secure-store; the PIN screen only needs this function's signature to stay the same.

const SAFE_PIN = '1111';
const DURESS_PIN = '9999';

export function checkPlaceholderPin(entry: string): PinResultKind {
  if (entry === SAFE_PIN) return 'safe';
  if (entry === DURESS_PIN) return 'duress';
  return 'wrong';
}
