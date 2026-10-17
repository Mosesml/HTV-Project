import type { RaveGuardNativeApi } from './RaveGuardNativeModule';
import type {
  NoiseEvent,
  ProtectionMode,
  RaveGuardEventName,
  RaveGuardEvents,
  Snapshot,
} from './RaveGuardNative.types';

// JavaScript stand-in for the Swift module, for Jest tests of screens. It records every
// call and lets a test push any event. Like the Swift runtime, setProtectionLevel and
// setNoiseBackend answer with an `onNoise` event and update the snapshot's noise,
// debugSetOffline updates the snapshot's simulatedOffline, and setProtectionMode (and
// setProtectionLevel, which switches to manual) emit `onHearing` when the mode changes. Push
// the AirPods connection with emit('onAirPods', { connected }) and set the snapshot's
// `airPodsConnected` with setSnapshot; a check-in's trigger travels in the onPhase payload.
// app/jest.setup.ts installs it for every app test;
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
  phase: { phase: 'idle', stage: null, stageEndsAt: null, escalationId: null, trigger: null },
  escalation: null,
  noise: { backend: 'off', connected: false, level: 0 },
  hearing: { roomDb: null, dosePercent: null, mode: 'auto', inEarDb: null, floorLevel: null },
  nextCheckInAt: null,
  simulatedOffline: false,
  airPodsConnected: null,
};

type AnyListener = (payload: unknown) => void;

export function createMockRaveGuardNative(): MockRaveGuardNative {
  let calls: MockCall[] = [];
  let listeners = new Map<RaveGuardEventName, Set<AnyListener>>();
  let snapshot: Snapshot = IDLE_SNAPSHOT;

  const record = (method: string, ...args: unknown[]): void => {
    calls = [...calls, { method, args }];
  };

  const emit: MockRaveGuardNative['emit'] = (event, payload) => {
    listeners.get(event)?.forEach((listener) => listener(payload));
  };

  // RaveGuardRuntime.setProtectionLevel / setNoiseBackend: change the noise state, then emit it.
  const changeNoise = (change: Partial<NoiseEvent>): void => {
    snapshot = { ...snapshot, noise: { ...snapshot.noise, ...change } };
    emit('onNoise', snapshot.noise);
  };

  // RaveGuardRuntime.setProtectionMode, and the slider's switch to manual: emit only a change.
  const changeMode = (mode: ProtectionMode): void => {
    if (snapshot.hearing.mode === mode) return;
    snapshot = { ...snapshot, hearing: { ...snapshot.hearing, mode } };
    emit('onHearing', snapshot.hearing);
  };

  return {
    get calls() {
      return calls;
    },
    configure: async (settings) => record('configure', settings),
    startSession: async () => {
      record('startSession');
      changeMode('auto'); // Swift starts every session automatic (BL1).
    },
    stopSession: async () => {
      record('stopSession');
      return true;
    },
    tapCancel: async () => record('tapCancel'),
    pinResult: async (kind) => record('pinResult', kind),
    setProtectionLevel: async (level) => {
      record('setProtectionLevel', level);
      changeNoise({ level });
      changeMode('manual');
    },
    setNoiseBackend: async (kind) => {
      record('setNoiseBackend', kind);
      // The Swift fake pretends every backend connects.
      changeNoise({ backend: kind, connected: kind !== 'off' });
    },
    handleNoiseCallbackURL: async () => false,
    debugFire: async (scenario) => record('debugFire', scenario),
    debugSetOffline: async (on) => {
      record('debugSetOffline', on);
      snapshot = { ...snapshot, simulatedOffline: on };
    },
    getSnapshot: async () => snapshot,
    addListener(event, listener) {
      const forEvent = listeners.get(event) ?? new Set<AnyListener>();
      forEvent.add(listener as AnyListener);
      listeners.set(event, forEvent);
      return { remove: () => forEvent.delete(listener as AnyListener) };
    },
    emit,
    setSnapshot(next) {
      snapshot = next;
    },
    reset() {
      calls = [];
      listeners = new Map();
      snapshot = IDLE_SNAPSHOT;
    },
    setProtectionMode: async (mode) => {
      record('setProtectionMode', mode);
      changeMode(mode);
    },
  };
}
