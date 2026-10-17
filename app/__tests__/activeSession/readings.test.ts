import {
  airPodsStatus,
  describeNextCheckIn,
  describeNoiseBackend,
  doseFraction,
  doseSpoken,
  floorLine,
  formatCountdown,
  formatDose,
  formatElapsed,
  formatRoomDb,
  inEarDbValue,
  motionLabel,
  NO_VALUE,
  noiseStatus,
  protectionMode,
  roomDbValue,
  spokenCountdown,
  spokenElapsed,
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

const SECOND = 1000;
const HOUR = 60 * MINUTE;

describe('formatElapsed / spokenElapsed', () => {
  test('shows minutes under an hour, hours and minutes from an hour', () => {
    expect(formatElapsed(0)).toBe('0m');
    expect(formatElapsed(59 * SECOND)).toBe('0m');
    expect(formatElapsed(12 * MINUTE + 30 * SECOND)).toBe('12m');
    expect(formatElapsed(HOUR)).toBe('1h 0m');
    expect(formatElapsed(HOUR + 42 * MINUTE)).toBe('1h 42m');
    expect(formatElapsed(11 * HOUR + 5 * MINUTE)).toBe('11h 5m');
  });

  test('never goes negative (a clock that stepped back)', () => {
    expect(formatElapsed(-5 * MINUTE)).toBe('0m');
    expect(spokenElapsed(-5 * MINUTE)).toBe('under a minute');
  });

  test('reads out in words for VoiceOver', () => {
    expect(spokenElapsed(30 * SECOND)).toBe('under a minute');
    expect(spokenElapsed(MINUTE)).toBe('1 minute');
    expect(spokenElapsed(12 * MINUTE)).toBe('12 minutes');
    expect(spokenElapsed(HOUR)).toBe('1 hour');
    expect(spokenElapsed(HOUR + MINUTE)).toBe('1 hour 1 minute');
    expect(spokenElapsed(2 * HOUR + 42 * MINUTE)).toBe('2 hours 42 minutes');
  });
});

describe('formatCountdown / spokenCountdown', () => {
  test('shows a dash when nothing is scheduled (demo mode)', () => {
    expect(formatCountdown(null, NOW)).toBe(NO_VALUE);
    expect(spokenCountdown(null, NOW)).toBe('Next check-in: not scheduled');
  });

  test('shows mm:ss, rounding seconds up', () => {
    expect(formatCountdown(NOW + 12 * MINUTE + 40 * SECOND, NOW)).toBe('12:40');
    expect(formatCountdown(NOW + 12 * MINUTE + 39 * SECOND + 1, NOW)).toBe('12:40');
    expect(formatCountdown(NOW + 5 * SECOND, NOW)).toBe('00:05');
    expect(formatCountdown(NOW + 60 * MINUTE, NOW)).toBe('60:00');
  });

  test('stops at 00:00 once the time has passed', () => {
    expect(formatCountdown(NOW, NOW)).toBe('00:00');
    expect(formatCountdown(NOW - MINUTE, NOW)).toBe('00:00');
  });

  test('reads out in words', () => {
    expect(spokenCountdown(NOW + 12 * MINUTE + 40 * SECOND, NOW)).toBe('Next check-in in 12 minutes 40 seconds');
    expect(spokenCountdown(NOW + MINUTE + SECOND, NOW)).toBe('Next check-in in 1 minute 1 second');
    expect(spokenCountdown(NOW + 30 * MINUTE, NOW)).toBe('Next check-in in 30 minutes');
    expect(spokenCountdown(NOW + 9 * SECOND, NOW)).toBe('Next check-in in 9 seconds');
    expect(spokenCountdown(NOW, NOW)).toBe('Next check-in any moment now');
  });
});

describe('hearing values', () => {
  test('room and in-ear dB are whole numbers, or a dash while null', () => {
    expect(roomDbValue(97.6)).toBe('98');
    expect(roomDbValue(null)).toBe(NO_VALUE);
    expect(roomDbValue(Number.NaN)).toBe(NO_VALUE);
    expect(inEarDbValue(75.8)).toBe('~76');
    expect(inEarDbValue(null)).toBe(NO_VALUE);
  });

  test('dose becomes a bar fraction and a spoken value, empty while null', () => {
    expect(doseFraction(46)).toBeCloseTo(0.46);
    expect(doseFraction(132)).toBeCloseTo(1.32);
    expect(doseFraction(null)).toBeNull();
    expect(doseSpoken(46.4)).toBe('46 percent of a safe daily amount');
    expect(doseSpoken(null)).toBe('no reading yet');
  });

  test('the floor line shows a dash until there is a floor', () => {
    expect(floorLine(null)).toBe("100% is a full day's safe exposure. Protection floor: —.");
    expect(floorLine(45)).toBe("100% is a full day's safe exposure. Protection floor has risen to 45.");
  });
});

describe('airPodsStatus', () => {
  test('connected, not connected, or not known yet', () => {
    expect(airPodsStatus(true)).toEqual({ status: 'Connected', tone: 'ok' });
    expect(airPodsStatus(false)).toEqual({ status: 'Not connected', tone: 'warning' });
    expect(airPodsStatus(null)).toEqual({ status: NO_VALUE, tone: 'off' });
  });
});

describe('noiseStatus', () => {
  test('names the backend and shows its mode and level once connected', () => {
    expect(noiseStatus({ backend: 'bridge', connected: true, level: 62 })).toEqual({
      title: 'Bridge',
      status: 'Adaptive · 62',
      tone: 'ok',
    });
    expect(noiseStatus({ backend: 'shortcuts', connected: true, level: 85 })).toEqual({
      title: 'Shortcuts',
      status: 'Noise Cancellation · 85',
      tone: 'ok',
    });
  });

  test('says when the backend is not connected or control is off', () => {
    expect(noiseStatus({ backend: 'bridge', connected: false, level: 72 })).toEqual({
      title: 'Bridge',
      status: 'Not connected',
      tone: 'warning',
    });
    expect(noiseStatus({ backend: 'off', connected: false, level: 0 })).toEqual({
      title: 'Noise control',
      status: 'Off',
      tone: 'off',
    });
  });

  test('a dash before Swift reports', () => {
    expect(noiseStatus(null)).toEqual({ title: 'Bridge', status: NO_VALUE, tone: 'off' });
  });
});
