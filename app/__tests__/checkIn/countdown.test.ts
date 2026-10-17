import { litTicks, RING_TICKS, stageCountdown } from '../../src/checkIn/countdown';

const START = 1_800_000_000_000;
const STAGE_MS = 10_000;
const ENDS_AT = START + STAGE_MS;

describe('stageCountdown', () => {
  test('is full with every second left when the stage has just started', () => {
    expect(stageCountdown(ENDS_AT, START, START)).toEqual({ secondsLeft: 10, fraction: 1 });
  });

  test('drains in proportion to the time gone', () => {
    expect(stageCountdown(ENDS_AT, START, START + 2_500)).toEqual({ secondsLeft: 8, fraction: 0.75 });
  });

  test('rounds the seconds up, so 0.2 s left still reads 1', () => {
    expect(stageCountdown(ENDS_AT, START, ENDS_AT - 200).secondsLeft).toBe(1);
  });

  test('is empty and never negative once the stage has ended', () => {
    expect(stageCountdown(ENDS_AT, START, ENDS_AT + 5_000)).toEqual({ secondsLeft: 0, fraction: 0 });
  });

  test('stays full when the clock reads earlier than the stage start', () => {
    expect(stageCountdown(ENDS_AT, START, START - 1_000).fraction).toBe(1);
  });

  test('is full while time is left if the stage start is unknown', () => {
    expect(stageCountdown(ENDS_AT, null, START + 4_000)).toEqual({ secondsLeft: 6, fraction: 1 });
  });

  test('is empty if the stage start is unknown and the stage has ended', () => {
    expect(stageCountdown(ENDS_AT, null, ENDS_AT).fraction).toBe(0);
  });

  test('is full rather than dividing by zero when the stage was first seen at its end', () => {
    expect(stageCountdown(ENDS_AT, ENDS_AT, ENDS_AT - 1).fraction).toBe(1);
  });
});

describe('litTicks', () => {
  test('lights every tick when full and none when empty', () => {
    expect(litTicks(1)).toBe(RING_TICKS);
    expect(litTicks(0)).toBe(0);
  });

  test('lights half the ring at half time', () => {
    expect(litTicks(0.5)).toBe(RING_TICKS / 2);
  });

  test('keeps one tick lit while any time is left', () => {
    expect(litTicks(0.001)).toBe(1);
  });

  test('clamps fractions outside 0 to 1', () => {
    expect(litTicks(1.5)).toBe(RING_TICKS);
    expect(litTicks(-0.5)).toBe(0);
  });

  test('works for any tick count', () => {
    expect(litTicks(0.25, 12)).toBe(3);
  });
});
