import * as Haptics from 'expo-haptics';

import * as RaveGuard from '../../modules/raveguard-native';
import type { PinResultKind } from '../../modules/raveguard-native';
import { CANCEL_HAPTIC } from './cancelSequence';

// Both calls are fire and forget: neither may change what the wearer sees, or how soon, so
// neither is awaited and neither failure is shown. Showing one could tell a safe PIN from a
// duress PIN (the duress rule in WORK_ORDER.md).

/** Sends the PIN result to Swift without waiting for it. Swift logs its own failures. */
export function sendPinResult(kind: PinResultKind): void {
  RaveGuard.pinResult(kind).catch(() => {
    // Deliberately ignored, see above.
  });
}

/** Plays the cancel haptic without waiting for it. A phone without haptics just stays still. */
export function playCancelHaptic(): void {
  Haptics.notificationAsync(CANCEL_HAPTIC).catch(() => {
    // Deliberately ignored: no haptics engine (Simulator, Low Power Mode) is not an error.
  });
}
