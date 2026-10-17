import type { CheckInStage } from '../../modules/raveguard-native';
import { NOD_COPY, STAGE_COUNT, STAGES, stageTitle } from '../../src/checkIn/stages';
import { CHECK_IN_STAGES, PALETTE, STAGE_COLORS } from '../../src/ui';

const ALL: CheckInStage[] = ['whisper', 'loud', 'pinGate'];

describe('check-in stages', () => {
  test('number the three stages in ladder order', () => {
    expect(ALL.map((stage) => STAGES[stage].step)).toEqual([1, 2, 3]);
    expect(STAGE_COUNT).toBe(3);
  });

  test('titles say which step of three the wearer is on, in the StageBar words', () => {
    expect(stageTitle('whisper')).toBe('Step 1 of 3: Whisper');
    expect(stageTitle('loud')).toBe('Step 2 of 3: Louder');
    expect(stageTitle('pinGate')).toBe('Step 3 of 3: PIN');
    expect(ALL.map((stage) => STAGES[stage].name)).toEqual(CHECK_IN_STAGES.map((entry) => entry.label));
  });

  test('Cancel works for the whisper and loud stages only (Swift ignores it at the PIN gate)', () => {
    expect(ALL.filter((stage) => STAGES[stage].canCancel)).toEqual(['whisper', 'loud']);
  });

  test('the ring takes the stage colour: lavender, amber, coral', () => {
    expect(ALL.map((stage) => STAGES[stage].color)).toEqual([STAGE_COLORS.whisper, STAGE_COLORS.loud, STAGE_COLORS.pinGate]);
    expect(STAGES.whisper.color).toBe(PALETTE.lavender);
    expect(STAGES.loud.color).toBe(PALETTE.amber);
  });

  test('the stage line says what the earbuds are doing, as in the mockups', () => {
    expect(STAGES.whisper).toMatchObject({ line: 'Whispering in your AirPods', lineIcon: 'speaker', lineColor: PALETTE.blue });
    expect(STAGES.loud).toMatchObject({ line: 'Louder prompt and vibrating', lineIcon: 'vibrate', lineColor: PALETTE.amber });
  });

  test('both stages use the same nod copy (two nods, as the detector wants)', () => {
    expect(NOD_COPY).toBe('Nod twice, or tap below.');
    expect(STAGES.whisper.nod).toBe(NOD_COPY);
    expect(STAGES.loud.nod).toBe(`${NOD_COPY} After this you'll need your PIN.`);
  });

  test('whisper names the trigger in a label; loud and later show it as a card', () => {
    expect(ALL.filter((stage) => STAGES[stage].showsTriggerCard)).toEqual(['loud', 'pinGate']);
  });
});
