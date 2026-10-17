import {
  AIRPODS_CONNECTED,
  AIRPODS_DISCONNECTED,
  airPodsDialog,
  NO_MOTION_HINT,
  NO_MOTION_HINT_MS,
} from '../../src/airpods/airPodsAlerts';

describe('airPodsDialog', () => {
  test.each([null, false] as const)('%p → connected says the head motion is live', (previous) => {
    expect(airPodsDialog(previous, true)).toEqual(AIRPODS_CONNECTED);
    expect(AIRPODS_CONNECTED.title).toBe('AirPods connected');
    expect(AIRPODS_CONNECTED.message).toMatch(/Head motion is live/);
  });

  test('connected → disconnected says RaveGuard is blind until they are back', () => {
    expect(airPodsDialog(true, false)).toEqual(AIRPODS_DISCONNECTED);
    expect(AIRPODS_DISCONNECTED.title).toBe('AirPods disconnected');
    expect(AIRPODS_DISCONNECTED.message).toMatch(/can't see your head motion/);
  });

  test.each([
    [true, true],
    [false, false],
  ] as const)('no change (%p → %p) shows nothing', (previous, next) => {
    expect(airPodsDialog(previous, next)).toBeNull();
  });

  test('a first report of "disconnected" shows nothing: they were never known to be in', () => {
    expect(airPodsDialog(null, false)).toBeNull();
  });
});

describe('no-motion hint', () => {
  test('waits 10 s and says where the Motion & Fitness switch is', () => {
    expect(NO_MOTION_HINT_MS).toBe(10_000);
    expect(NO_MOTION_HINT.title).toBe('No AirPods motion yet');
    expect(NO_MOTION_HINT.message).toMatch(/both AirPods/);
    expect(NO_MOTION_HINT.message).toMatch(/Settings → Privacy & Security → Motion & Fitness → RaveGuard/);
  });
});
