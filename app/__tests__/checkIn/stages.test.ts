import type { CheckInStage } from '../../modules/raveguard-native';
import { STAGE_COUNT, STAGES, stageTitle } from '../../src/checkIn/stages';

const ALL: CheckInStage[] = ['whisper', 'loud', 'pinGate'];

describe('check-in stages', () => {
  test('number the three stages in ladder order', () => {
    expect(ALL.map((stage) => STAGES[stage].step)).toEqual([1, 2, 3]);
    expect(STAGE_COUNT).toBe(3);
  });

  test('titles say which step of three the wearer is on', () => {
    expect(stageTitle('whisper')).toBe('Step 1 of 3: Whisper');
    expect(stageTitle('loud')).toBe('Step 2 of 3: Loud');
    expect(stageTitle('pinGate')).toBe('Step 3 of 3: PIN gate');
  });

  test('Cancel works for the whisper and loud stages only (Swift ignores it at the PIN gate)', () => {
    expect(ALL.filter((stage) => STAGES[stage].canCancel)).toEqual(['whisper', 'loud']);
  });

  test('each stage has its own ring color', () => {
    expect(new Set(ALL.map((stage) => STAGES[stage].color)).size).toBe(3);
  });
});
