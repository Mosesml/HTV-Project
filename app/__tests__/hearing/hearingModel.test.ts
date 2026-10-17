import { doseBand, summarizeHearing } from '../../src/hearing/hearingModel';

describe('doseBand', () => {
  test.each([
    [null, 'unknown'],
    [Number.NaN, 'unknown'],
    [0, 'ok'],
    [49.9, 'ok'],
    [50, 'high'],
    [99.9, 'high'],
    [100, 'over'],
    [240, 'over'],
  ] as const)('%p%% is %s', (dosePercent, band) => {
    expect(doseBand(dosePercent)).toBe(band);
  });
});

describe('summarizeHearing', () => {
  test('before the snapshot: automatic, dashes, no dose band', () => {
    expect(summarizeHearing(null)).toEqual({
      mode: 'auto',
      isAuto: true,
      modeLabel: 'Automatic',
      modeHint: "RaveGuard sets protection from the room's loudness.",
      roomText: '—',
      doseText: '—',
      doseBand: 'unknown',
      doseBandText: 'No reading yet',
      accessibilityLabel: 'Protection automatic. Room —. Sound dose (estimate) —.',
    });
  });

  test('automatic with readings', () => {
    const summary = summarizeHearing({ roomDb: 103.6, dosePercent: 64.2, mode: 'auto' });
    expect(summary).toMatchObject({
      isAuto: true,
      roomText: '104 dB',
      doseText: '64%',
      doseBand: 'high',
      doseBandText: "Over half of today's allowance",
      accessibilityLabel: 'Protection automatic. Room 104 dB. Sound dose (estimate) 64%.',
    });
  });

  test('manual says the slider is in charge', () => {
    const summary = summarizeHearing({ roomDb: 90, dosePercent: 120, mode: 'manual' });
    expect(summary).toMatchObject({
      mode: 'manual',
      isAuto: false,
      modeLabel: 'Manual',
      modeHint: 'You set protection with the slider.',
      doseBand: 'over',
      doseBandText: "Over today's allowance",
    });
  });
});
