import nativeModule from '../modules/raveguard-native/src/RaveGuardNativeModule';
import type { MockRaveGuardNative } from '../modules/raveguard-native/src/mock';
import type { CheckInTrigger, PhaseEvent } from '../modules/raveguard-native/src/RaveGuardNative.types';

/** The mock jest.setup.ts installs in place of the Swift module. */
export function nativeMock(): MockRaveGuardNative {
  return nativeModule as unknown as MockRaveGuardNative;
}

/** Names of the native methods called so far, in order. */
export function calledMethods(): string[] {
  return nativeMock().calls.map((call) => call.method);
}

/** What Swift sends as `trigger` for a debug fall (scenarios 2, 5 and 7). */
export const FALL_TRIGGER = {
  kind: 'fall',
  reason: 'spike 3.1 g, head 70° sideways, still 12 s',
  at: 1_800_000_000_000,
} as const satisfies CheckInTrigger;

// Like Swift: a check-in, its escalation and SOS carry what started it; idle and monitoring don't.
export const PHASES = {
  idle: { phase: 'idle', stage: null, stageEndsAt: null, escalationId: null, trigger: null },
  monitoring: { phase: 'monitoring', stage: null, stageEndsAt: null, escalationId: null, trigger: null },
  whisper: { phase: 'checkIn', stage: 'whisper', stageEndsAt: null, escalationId: null, trigger: FALL_TRIGGER },
  loud: { phase: 'checkIn', stage: 'loud', stageEndsAt: null, escalationId: null, trigger: FALL_TRIGGER },
  pinGate: { phase: 'checkIn', stage: 'pinGate', stageEndsAt: null, escalationId: 'esc-1', trigger: FALL_TRIGGER },
  escalated: { phase: 'escalated', stage: null, stageEndsAt: null, escalationId: 'esc-1', trigger: FALL_TRIGGER },
  sos: { phase: 'sos', stage: null, stageEndsAt: null, escalationId: 'esc-1', trigger: FALL_TRIGGER },
} as const satisfies Record<string, PhaseEvent>;
