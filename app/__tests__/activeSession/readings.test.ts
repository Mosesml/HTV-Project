import {
  describeNextCheckIn,
  describeNoiseBackend,
  formatDose,
  formatRoomDb,
  motionLabel,
  NO_VALUE,
  protectionMode,
} from '../../src/activeSession/readings';

const MINUTE = 60_000;
const NOW = 1_800_000_000_000;

describe('formatRoomDb', () => {
  test('shows a dash while onHearing sends null', () => {
    expect(formatRoomDb(null)).toBe(NO_VALUE);
    expect(NO_VALUE).toBe('—');
  });

  test('rounds to whole decibels', () => {
    expect(formatRoomDb(94.4)).toBe('94 dB');
    expect(formatRoomDb(94.5)).toBe('95 dB');
    expect(formatRoomDb(0)).toBe('0 dB');
  });

  test('shows a dash for a number that is not finite', () => {
    expect(formatRoomDb(Number.NaN)).toBe(NO_VALUE);
    expect(formatRoomDb(Number.POSITIVE_INFINITY)).toBe(NO_VALUE);
  });
});

describe('formatDose', () => {
  test('shows a dash while onHearing sends null', () => {
    expect(formatDose(null)).toBe(NO_VALUE);
  });

  test('rounds to a whole percent and can go past 100', () => {
    expect(formatDose(41.6)).toBe('42%');
    expect(formatDose(0)).toBe('0%');
    expect(formatDose(132)).toBe('132%');
  });

  test('shows a dash for a number that is not finite', () => {
    expect(formatDose(Number.NaN)).toBe(NO_VALUE);
  });
});

describe('motionLabel', () => {
  test('shows a dash before the first readout', () => {
    expect(motionLabel(null)).toBe(NO_VALUE);
  });

  test.each([
    ['dancing', 'Dancing'],
    ['walking', 'Walking'],
    ['still', 'Still'],
    ['fallen', 'Fallen'],
    ['unknown', 'Unknown'],
  ] as const)('%s reads as %s', (state, label) => {
    expect(motionLabel(state)).toBe(label);
  });
});

describe('describeNextCheckIn', () => {
  test('shows a dash when Swift has nothing scheduled', () => {
    expect(describeNextCheckIn(null, NOW)).toBe(NO_VALUE);
  });

  test('rounds minutes up', () => {
    expect(describeNextCheckIn(NOW + 30 * MINUTE, NOW)).toBe('In 30 min');
    expect(describeNextCheckIn(NOW + 29 * MINUTE + 1, NOW)).toBe('In 30 min');
    expect(describeNextCheckIn(NOW + MINUTE, NOW)).toBe('In 1 min');
  });

  test('says under a minute for the last minute', () => {
    expect(describeNextCheckIn(NOW + MINUTE - 1, NOW)).toBe('In under a minute');
    expect(describeNextCheckIn(NOW + 1, NOW)).toBe('In under a minute');
  });

  test('says any moment now once the time has passed', () => {
    expect(describeNextCheckIn(NOW, NOW)).toBe('Any moment now');
    expect(describeNextCheckIn(NOW - MINUTE, NOW)).toBe('Any moment now');
  });
});

describe('protectionMode', () => {
  test('is Adaptive below 70 and Noise Cancellation from 70 (Moses’s ShortcutsController)', () => {
    expect(protectionMode(0)).toBe('Adaptive');
    expect(protectionMode(69)).toBe('Adaptive');
    expect(protectionMode(70)).toBe('Noise Cancellation');
    expect(protectionMode(100)).toBe('Noise Cancellation');
  });
});

describe('describeNoiseBackend', () => {
  test('says when AirPods control is off', () => {
    expect(describeNoiseBackend({ backend: 'off', connected: false, level: 40 })).toBe('AirPods control off');
  });

  test('names a connected backend', () => {
    expect(describeNoiseBackend({ backend: 'shortcuts', connected: true, level: 40 })).toBe('Through Shortcuts');
    expect(describeNoiseBackend({ backend: 'bridge', connected: true, level: 40 })).toBe('Through the bridge');
  });

  test('says when a backend is not connected', () => {
    expect(describeNoiseBackend({ backend: 'shortcuts', connected: false, level: 40 })).toBe('Shortcuts not connected');
    expect(describeNoiseBackend({ backend: 'bridge', connected: false, level: 40 })).toBe('Bridge not connected');
  });
});
