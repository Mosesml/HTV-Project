import type { RaveGuardNativeApi } from './RaveGuardNativeModule';
import type { RaveGuardEventName, RaveGuardEvents, Snapshot } from './RaveGuardNative.types';

// JavaScript stand-in for the Swift module, for Jest tests of screens. It records every
// call and lets a test push any event. app/jest.setup.ts installs it for every app test;
// a test outside the app can install it with:
//   jest.mock('<path>/modules/raveguard-native/src/RaveGuardNativeModule', () => {
//     const { createMockRaveGuardNative } = jest.requireActual('<path>/modules/raveguard-native/src/mock');
//     return { __esModule: true, default: createMockRaveGuardNative() };
//   });

export interface MockCall {
  method: string;
  args: unknown[];
}

export interface MockRaveGuardNative extends RaveGuardNativeApi {
  readonly calls: readonly MockCall[];
  emit<E extends RaveGuardEventName>(event: E, payload: Parameters<RaveGuardEvents[E]>[0]): void;
  /** What `getSnapshot()` resolves to from now on, e.g. a relaunch in the middle of a check-in. */
  setSnapshot(snapshot: Snapshot): void;
  /** Clears calls and listeners, and puts the snapshot back to idle. */
  reset(): void;
}

export const IDLE_SNAPSHOT: Snapshot = {
  phase: { phase: 'idle', stage: null, stageEndsAt: null, escalationId: null },
  escalation: null,
  noise: { backend: 'off', connected: false, level: 0 },
  hearing: { roomDb: null, dosePercent: null },
};

type AnyListener = (payload: unknown) => void;

export function createMockRaveGuardNative(): MockRaveGuardNative {
  let calls: MockCall[] = [];
  let listeners = new Map<RaveGuardEventName, Set<AnyListener>>();
  let snapshot: Snapshot = IDLE_SNAPSHOT;

  const record = (method: string, ...args: unknown[]): void => {
    calls = [...calls, { method, args }];
  };

  return {
    get calls() {
      return calls;
    },
    configure: async (settings) => record('configure', settings),
    startSession: async () => record('startSession'),
    stopSession: async () => {
      record('stopSession');
      return true;
    },
    tapCancel: async () => record('tapCancel'),
    pinResult: async (kind) => record('pinResult', kind),
    setProtectionLevel: async (level) => record('setProtectionLevel', level),
    setNoiseBackend: async (kind) => record('setNoiseBackend', kind),
    debugFire: async (scenario) => record('debugFire', scenario),
    debugSetOffline: async (on) => record('debugSetOffline', on),
    getSnapshot: async () => snapshot,
    addListener(event, listener) {
      const forEvent = listeners.get(event) ?? new Set<AnyListener>();
      forEvent.add(listener as AnyListener);
      listeners.set(event, forEvent);
      return { remove: () => forEvent.delete(listener as AnyListener) };
    },
    emit(event, payload) {
      listeners.get(event)?.forEach((listener) => listener(payload));
    },
    setSnapshot(next) {
      snapshot = next;
    },
    reset() {
      calls = [];
      listeners = new Map();
      snapshot = IDLE_SNAPSHOT;
    },
  };
}
