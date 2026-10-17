import type { CheckInStage } from '../../modules/raveguard-native';
import { COLORS } from '../ui/theme';

// What the Check-in screen says and shows for each stage of the ladder (K7, PRD D8).

export interface StageInfo {
  /** Position in the ladder, 1 to STAGE_COUNT. */
  step: number;
  name: string;
  hint: string;
  /** Ring color for this stage. */
  color: string;
  /** Swift ignores tapCancel at the PIN gate (SessionManager.tapCancel), so no Cancel there. */
  canCancel: boolean;
}

export const STAGES: Record<CheckInStage, StageInfo> = {
  whisper: {
    step: 1,
    name: 'Whisper',
    hint: "Nod if you're okay, or tap Cancel.",
    color: COLORS.stageWhisper,
    canCancel: true,
  },
  loud: {
    step: 2,
    name: 'Loud',
    hint: 'Nod or tap Cancel now.',
    color: COLORS.stageLoud,
    canCancel: true,
  },
  pinGate: {
    step: 3,
    name: 'PIN gate',
    hint: 'Enter your PIN to stop the alert.',
    color: COLORS.stagePinGate,
    canCancel: false,
  },
};

export const STAGE_COUNT = Object.keys(STAGES).length;

/** "Step 2 of 3: Loud". */
export function stageTitle(stage: CheckInStage): string {
  const { step, name } = STAGES[stage];
  return `Step ${step} of ${STAGE_COUNT}: ${name}`;
}
