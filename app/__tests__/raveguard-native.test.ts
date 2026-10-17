import * as RaveGuard from '../modules/raveguard-native';
import nativeModule from '../modules/raveguard-native/src/RaveGuardNativeModule';
import type { MockRaveGuardNative } from '../modules/raveguard-native/src/mock';
import type { PhaseEvent, Settings } from '../modules/raveguard-native/src/RaveGuardNative.types';

jest.mock('../modules/raveguard-native/src/RaveGuardNativeModule', () => {
  const { createMockRaveGuardNative } = jest.requireActual('../modules/raveguard-native/src/mock');
  return { __esModule: true, default: createMockRaveGuardNative() };
});

const native = nativeModule as unknown as MockRaveGuardNative;

const SETTINGS: Settings = {
  wearerName: 'Alex',
  selfDescription: 'black hoodie',
  recipients: [],
  intervalMin: 30,
  loudnessTarget: 85,
  demo: true,
  teammatePhone: '+14165550123',
  bridgeUrl: null,
};

beforeEach(() => native.reset());

describe('raveguard-native: forwards valid calls to Swift', () => {
  test('configure, start, stop and cancel reach the native module in order', async () => {
    await RaveGuard.configure(SETTINGS);
    await RaveGuard.startSession();
    await RaveGuard.tapCancel();
    await expect(RaveGuard.stopSession()).resolves.toBe(true);
    expect(native.calls.map((c) => c.method)).toEqual([
      'configure',
      'startSession',
      'tapCancel',
      'stopSession',
    ]);
    expect(native.calls[0].args).toEqual([SETTINGS]);
  });

  test.each([0, 55, 100])('setProtectionLevel(%p) is forwarded', async (level) => {
    await RaveGuard.setProtectionLevel(level);
    expect(native.calls).toEqual([{ method: 'setProtectionLevel', args: [level] }]);
  });

  test.each(['safe', 'duress', 'wrong'] as const)('pinResult(%p) is forwarded', async (kind) => {
    await RaveGuard.pinResult(kind);
    expect(native.calls).toEqual([{ method: 'pinResult', args: [kind] }]);
  });

  test('debug calls are forwarded', async () => {
    await RaveGuard.debugFire(7);
    await RaveGuard.debugSetOffline(true);
    await RaveGuard.setNoiseBackend('shortcuts');
    expect(native.calls).toEqual([
      { method: 'debugFire', args: [7] },
      { method: 'debugSetOffline', args: [true] },
      { method: 'setNoiseBackend', args: ['shortcuts'] },
    ]);
  });

  test('getSnapshot returns the idle state before anything starts', async () => {
    await expect(RaveGuard.getSnapshot()).resolves.toMatchObject({
      phase: { phase: 'idle', stage: null, stageEndsAt: null, escalationId: null },
      escalation: null,
    });
  });
});

describe('raveguard-native: rejects bad arguments before they reach Swift', () => {
  test.each([-1, 101, 3.5, Number.NaN])('setProtectionLevel(%p) rejects', async (level) => {
    await expect(RaveGuard.setProtectionLevel(level)).rejects.toThrow(/level/);
    expect(native.calls).toEqual([]);
  });

  test.each([0, 8, 2.5])('debugFire(%p) rejects', async (scenario) => {
    await expect(RaveGuard.debugFire(scenario)).rejects.toThrow(/scenario/);
    expect(native.calls).toEqual([]);
  });

  test('pinResult rejects an unknown kind', async () => {
    await expect(RaveGuard.pinResult('maybe' as never)).rejects.toThrow(/pinResult/);
    expect(native.calls).toEqual([]);
  });

  test('setNoiseBackend rejects an unknown backend', async () => {
    await expect(RaveGuard.setNoiseBackend('wifi' as never)).rejects.toThrow(/backend/);
    expect(native.calls).toEqual([]);
  });

  test('debugSetOffline rejects a non-boolean', async () => {
    await expect(RaveGuard.debugSetOffline('yes' as never)).rejects.toThrow(/boolean/);
    expect(native.calls).toEqual([]);
  });
});

describe('raveguard-native: events', () => {
  const checkIn: PhaseEvent = {
    phase: 'checkIn',
    stage: 'whisper',
    stageEndsAt: 1_800_000_010_000,
    escalationId: null,
  };

  test('a listener receives events until it is removed', () => {
    const received: PhaseEvent[] = [];
    const subscription = RaveGuard.addListener('onPhase', (event) => received.push(event));
    native.emit('onPhase', checkIn);
    subscription.remove();
    native.emit('onPhase', { ...checkIn, phase: 'monitoring', stage: null, stageEndsAt: null });
    expect(received).toEqual([checkIn]);
  });

  test('listeners only hear their own event', () => {
    const phases: PhaseEvent[] = [];
    RaveGuard.addListener('onPhase', (event) => phases.push(event));
    native.emit('onNoise', { backend: 'off', connected: false, level: 0 });
    expect(phases).toEqual([]);
  });
});
