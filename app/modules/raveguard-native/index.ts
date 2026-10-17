import type { EventSubscription } from 'expo-modules-core';

import RaveGuardNative from './src/RaveGuardNativeModule';
import type {
  NoiseBackend,
  PinResultKind,
  ProtectionMode,
  RaveGuardEventName,
  RaveGuardEvents,
  Settings,
  Snapshot,
} from './src/RaveGuardNative.types';

export * from './src/RaveGuardNative.types';
export { RaveGuardNative };

// The RaveGuard native module (K2). Screens import from here, not from the native module
// directly: these wrappers reject bad arguments in JavaScript, with a readable message,
// before anything crosses into Swift. Every call returns a promise.

const MIN_PROTECTION_LEVEL = 0;
const MAX_PROTECTION_LEVEL = 100;
const FIRST_SCENARIO = 1;
const LAST_SCENARIO = 7;
const PIN_RESULTS: readonly PinResultKind[] = ['safe', 'duress', 'wrong'];
const NOISE_BACKENDS: readonly NoiseBackend[] = ['bridge', 'shortcuts', 'automation', 'off'];

function isIntegerInRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

export async function configure(settings: Settings): Promise<void> {
  return RaveGuardNative.configure(settings);
}

export async function startSession(): Promise<void> {
  return RaveGuardNative.startSession();
}

/** Resolves false, and does nothing, while a check-in or escalation is open. */
export async function stopSession(): Promise<boolean> {
  return RaveGuardNative.stopSession();
}

export async function tapCancel(): Promise<void> {
  return RaveGuardNative.tapCancel();
}

/** Call without awaiting the result: the PIN screen must look the same for safe and duress. */
export async function pinResult(kind: PinResultKind): Promise<void> {
  if (!PIN_RESULTS.includes(kind)) {
    throw new TypeError(`pinResult: kind must be one of ${PIN_RESULTS.join(', ')} (got ${String(kind)})`);
  }
  return RaveGuardNative.pinResult(kind);
}

export async function setProtectionLevel(level: number): Promise<void> {
  if (!isIntegerInRange(level, MIN_PROTECTION_LEVEL, MAX_PROTECTION_LEVEL)) {
    throw new RangeError(
      `setProtectionLevel: level must be an integer from ${MIN_PROTECTION_LEVEL} to ${MAX_PROTECTION_LEVEL} (got ${level})`
    );
  }
  return RaveGuardNative.setProtectionLevel(level);
}

export async function setNoiseBackend(kind: NoiseBackend): Promise<void> {
  if (!NOISE_BACKENDS.includes(kind)) {
    throw new TypeError(`setNoiseBackend: backend must be one of ${NOISE_BACKENDS.join(', ')} (got ${String(kind)})`);
  }
  return RaveGuardNative.setNoiseBackend(kind);
}

/** Forwards Shortcuts x-callback-url returns to the native controller. */
export async function handleNoiseCallbackURL(url: string): Promise<boolean> {
  return RaveGuardNative.handleNoiseCallbackURL(url);
}

/** Debug panel: starts scenario 1–7 the way the PRD's acceptance table does. */
export async function debugFire(scenario: number): Promise<void> {
  if (!isIntegerInRange(scenario, FIRST_SCENARIO, LAST_SCENARIO)) {
    throw new RangeError(`debugFire: scenario must be an integer from ${FIRST_SCENARIO} to ${LAST_SCENARIO} (got ${scenario})`);
  }
  return RaveGuardNative.debugFire(scenario);
}

/** Debug panel: every server call fails while on, as if the phone were in airplane mode. */
export async function debugSetOffline(on: boolean): Promise<void> {
  if (typeof on !== 'boolean') {
    throw new TypeError(`debugSetOffline: on must be a boolean (got ${String(on)})`);
  }
  return RaveGuardNative.debugSetOffline(on);
}

export async function getSnapshot(): Promise<Snapshot> {
  return RaveGuardNative.getSnapshot();
}

export function addListener<E extends RaveGuardEventName>(
  event: E,
  listener: RaveGuardEvents[E]
): EventSubscription {
  return RaveGuardNative.addListener(event, listener);
}

const PROTECTION_MODES: readonly ProtectionMode[] = ['auto', 'manual'];

/** BL1: hand protection to Swift's level loop (`auto`) or keep the slider's level (`manual`). */
export async function setProtectionMode(mode: ProtectionMode): Promise<void> {
  if (!PROTECTION_MODES.includes(mode)) {
    throw new TypeError(`setProtectionMode: mode must be one of ${PROTECTION_MODES.join(', ')} (got ${String(mode)})`);
  }
  return RaveGuardNative.setProtectionMode(mode);
}
