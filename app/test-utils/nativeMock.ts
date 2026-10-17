import nativeModule from '../modules/raveguard-native/src/RaveGuardNativeModule';
import type { MockRaveGuardNative } from '../modules/raveguard-native/src/mock';
import type { PhaseEvent } from '../modules/raveguard-native/src/RaveGuardNative.types';

/** The mock jest.setup.ts installs in place of the Swift module. */
export function nativeMock(): MockRaveGuardNative {
  return nativeModule as unknown as MockRaveGuardNative;
}

/** Names of the native methods called so far, in order. */
export function calledMethods(): string[] {
  return nativeMock().calls.map((call) => call.method);
}

export const PHASES = {
  idle: { phase: 'idle', stage: null, stageEndsAt: null, escalationId: null },
  monitoring: { phase: 'monitoring', stage: null, stageEndsAt: null, escalationId: null },
  whisper: { phase: 'checkIn', stage: 'whisper', stageEndsAt: null, escalationId: null },
  loud: { phase: 'checkIn', stage: 'loud', stageEndsAt: null, escalationId: null },
  pinGate: { phase: 'checkIn', stage: 'pinGate', stageEndsAt: null, escalationId: 'esc-1' },
  escalated: { phase: 'escalated', stage: null, stageEndsAt: null, escalationId: 'esc-1' },
  sos: { phase: 'sos', stage: null, stageEndsAt: null, escalationId: 'esc-1' },
} as const satisfies Record<string, PhaseEvent>;
