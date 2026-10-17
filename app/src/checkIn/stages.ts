import type { CheckInStage } from '../../modules/raveguard-native';
import { PALETTE, STAGE_COLORS, type IconName } from '../ui';

// What the Check-in screen says and shows for each stage of the ladder (K7, PRD D8), from the
// CheckIn-Whisper and CheckIn-Loud mockups. One screen for every stage (brief rule 5): only
// these words, the accent and the ring colour change.

/**
 * The nod copy, the same on both stages: the detector wants two pitch reversals, so "twice"
 * (the loud mockup's "Nod, or tap below." was unified to this).
 */
export const NOD_COPY = 'Nod twice, or tap below.';

export interface StageInfo {
  /** Position in the ladder, 1 to STAGE_COUNT. */
  step: number;
  /** The StageBar's word for the stage (Whisper, Louder, PIN). */
  name: string;
  /** What the earbuds are doing, beside an icon under the heading. */
  line: string;
  lineIcon: IconName;
  lineColor: string;
  /** How to answer. */
  nod: string;
  /** Ring colour for this stage. */
  color: string;
  /** Loud and later show what started the check-in as a card; whisper as a small label. */
  showsTriggerCard: boolean;
  /** Swift ignores tapCancel at the PIN gate (SessionManager.tapCancel), so no "I'm okay" there. */
  canCancel: boolean;
}

export const STAGES: Record<CheckInStage, StageInfo> = {
  whisper: {
    step: 1,
    name: 'Whisper',
    line: 'Whispering in your AirPods',
    lineIcon: 'speaker',
    lineColor: PALETTE.blue,
    nod: NOD_COPY,
    color: STAGE_COLORS.whisper,
    showsTriggerCard: false,
    canCancel: true,
  },
  loud: {
    step: 2,
    name: 'Louder',
    line: 'Louder prompt and vibrating',
    lineIcon: 'vibrate',
    lineColor: STAGE_COLORS.loud,
    nod: `${NOD_COPY} After this you'll need your PIN.`,
    color: STAGE_COLORS.loud,
    showsTriggerCard: true,
    canCancel: true,
  },
  pinGate: {
    step: 3,
    name: 'PIN',
    line: 'Time for your PIN',
    lineIcon: 'lock',
    lineColor: STAGE_COLORS.pinGate,
    nod: 'Enter your PIN to stop the alert.',
    color: STAGE_COLORS.pinGate,
    showsTriggerCard: true,
    canCancel: false,
  },
};

export const STAGE_COUNT = Object.keys(STAGES).length;

/** "Step 2 of 3: Louder", the same words the StageBar reads to VoiceOver. */
export function stageTitle(stage: CheckInStage): string {
  const { step, name } = STAGES[stage];
  return `Step ${step} of ${STAGE_COUNT}: ${name}`;
}
