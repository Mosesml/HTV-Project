import * as RaveGuard from '../modules/raveguard-native';
import nativeModule from '../modules/raveguard-native/src/RaveGuardNativeModule';
import type { MockRaveGuardNative } from '../modules/raveguard-native/src/mock';
import type {
  AirPodsEvent,
  HearingEvent,
  NoiseEvent,
  PhaseEvent,
  Settings,
} from '../modules/raveguard-native/src/RaveGuardNative.types';

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
  meetingSpot: 'by the bar',
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
      phase: { phase: 'idle', stage: null, stageEndsAt: null, escalationId: null, trigger: null },
      escalation: null,
      nextCheckInAt: null,
      simulatedOffline: false,
      airPodsConnected: null,
    });
  });
});

describe('raveguard-native: UI redesign contract additions', () => {
  test('configure carries the meeting spot', async () => {
    await RaveGuard.configure(SETTINGS);
    expect(native.calls[0].args[0]).toMatchObject({ meetingSpot: 'by the bar' });
  });

  test('onPhase carries what started the check-in', () => {
    const received: PhaseEvent[] = [];
    RaveGuard.addListener('onPhase', (event) => received.push(event));
    const fall: PhaseEvent = {
      phase: 'checkIn',
      stage: 'loud',
      stageEndsAt: 1_800_000_010_000,
      escalationId: null,
      trigger: { kind: 'fall', reason: 'spike 3.1 g, head 70° sideways, still 12 s', at: 1_800_000_000_000 },
    };
    native.emit('onPhase', fall);
    expect(received).toEqual([fall]);
  });

  test('onAirPods reports the connection', () => {
    const received: AirPodsEvent[] = [];
    RaveGuard.addListener('onAirPods', (event) => received.push(event));
    native.emit('onAirPods', { connected: false });
    expect(received).toEqual([{ connected: false }]);
  });
});

describe('raveguard-native mock: noise behaves like the Swift runtime', () => {
  test('setProtectionLevel emits onNoise with the new level, as Swift does', async () => {
    const received: NoiseEvent[] = [];
    RaveGuard.addListener('onNoise', (event) => received.push(event));
    await RaveGuard.setProtectionLevel(55);
    await RaveGuard.setProtectionLevel(80);
    expect(received).toEqual([
      { backend: 'off', connected: false, level: 55 },
      { backend: 'off', connected: false, level: 80 },
    ]);
    await expect(RaveGuard.getSnapshot()).resolves.toMatchObject({ noise: { level: 80 } });
  });

  test('setNoiseBackend emits onNoise and keeps the level; every backend but off "connects"', async () => {
    const received: NoiseEvent[] = [];
    RaveGuard.addListener('onNoise', (event) => received.push(event));
    await RaveGuard.setProtectionLevel(70);
    await RaveGuard.setNoiseBackend('shortcuts');
    await RaveGuard.setNoiseBackend('off');
    expect(received.slice(1)).toEqual([
      { backend: 'shortcuts', connected: true, level: 70 },
      { backend: 'off', connected: false, level: 70 },
    ]);
  });

  test('debugSetOffline updates the snapshot, as Swift does (K11)', async () => {
    await RaveGuard.debugSetOffline(true);
    await expect(RaveGuard.getSnapshot()).resolves.toMatchObject({ simulatedOffline: true });
    await RaveGuard.debugSetOffline(false);
    await expect(RaveGuard.getSnapshot()).resolves.toMatchObject({ simulatedOffline: false });
  });

  test('reset puts the noise state back to idle', async () => {
    await RaveGuard.setProtectionLevel(90);
    native.reset();
    await expect(RaveGuard.getSnapshot()).resolves.toMatchObject({ noise: { backend: 'off', connected: false, level: 0 } });
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
    trigger: { kind: 'scheduled', reason: 'scheduled check-in', at: 1_800_000_000_000 },
  };

  test('a listener receives events until it is removed', () => {
    const received: PhaseEvent[] = [];
    const subscription = RaveGuard.addListener('onPhase', (event) => received.push(event));
    native.emit('onPhase', checkIn);
    subscription.remove();
    native.emit('onPhase', { ...checkIn, phase: 'monitoring', stage: null, stageEndsAt: null, trigger: null });
    expect(received).toEqual([checkIn]);
  });

  test('listeners only hear their own event', () => {
    const phases: PhaseEvent[] = [];
    RaveGuard.addListener('onPhase', (event) => phases.push(event));
    native.emit('onNoise', { backend: 'off', connected: false, level: 0 });
    expect(phases).toEqual([]);
  });
});

describe('raveguard-native: protection mode (BL1)', () => {
  test('the idle snapshot has no readings and automatic protection', async () => {
    await expect(RaveGuard.getSnapshot()).resolves.toMatchObject({
      hearing: { roomDb: null, dosePercent: null, mode: 'auto', inEarDb: null, floorLevel: null },
    });
  });

  test('setProtectionMode reaches Swift and the mock emits onHearing with the new mode', async () => {
    const received: HearingEvent[] = [];
    RaveGuard.addListener('onHearing', (event) => received.push(event));
    await RaveGuard.setProtectionMode('manual');
    await RaveGuard.setProtectionMode('auto');
    expect(native.calls.map((c) => [c.method, ...c.args])).toEqual([
      ['setProtectionMode', 'manual'],
      ['setProtectionMode', 'auto'],
    ]);
    expect(received.map((event) => event.mode)).toEqual(['manual', 'auto']);
  });

  test('moving the slider switches to manual, as Swift does, and says so once', async () => {
    const received: HearingEvent[] = [];
    RaveGuard.addListener('onHearing', (event) => received.push(event));
    await RaveGuard.setProtectionLevel(40);
    await RaveGuard.setProtectionLevel(45);
    expect(received).toEqual([{ roomDb: null, dosePercent: null, mode: 'manual', inEarDb: null, floorLevel: null }]);
    await expect(RaveGuard.getSnapshot()).resolves.toMatchObject({ hearing: { mode: 'manual' } });
  });

  test('every session starts automatic, as in Swift', async () => {
    await RaveGuard.setProtectionLevel(40);
    const received: HearingEvent[] = [];
    RaveGuard.addListener('onHearing', (event) => received.push(event));
    await RaveGuard.startSession();
    expect(received.map((event) => event.mode)).toEqual(['auto']);
  });

  test('reset puts the mode back to auto', async () => {
    await RaveGuard.setProtectionMode('manual');
    native.reset();
    await expect(RaveGuard.getSnapshot()).resolves.toMatchObject({ hearing: { mode: 'auto' } });
  });

  test('setProtectionMode rejects an unknown mode', async () => {
    await expect(RaveGuard.setProtectionMode('loud' as never)).rejects.toThrow(/mode/);
    expect(native.calls).toEqual([]);
  });
});
