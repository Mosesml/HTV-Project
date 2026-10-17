import { StyleSheet, Text, View } from 'react-native';

import type { CheckInStage } from '../../modules/raveguard-native';
import { FONTS, STAGE_BAR_COLORS, STAGE_COLORS, TEXT } from './theme';

export type StageState = 'done' | 'active' | 'inactive';

export const CHECK_IN_STAGES: readonly { stage: CheckInStage; label: string }[] = [
  { stage: 'whisper', label: 'Whisper' },
  { stage: 'loud', label: 'Louder' },
  { stage: 'pinGate', label: 'PIN' },
];

/** Where `stage` sits relative to `current`: behind it (done), on it (active) or ahead (inactive). */
export function stageState(stage: CheckInStage, current: CheckInStage | null): StageState {
  if (current === null) return 'inactive';
  const at = CHECK_IN_STAGES.findIndex((entry) => entry.stage === current);
  const index = CHECK_IN_STAGES.findIndex((entry) => entry.stage === stage);
  if (index < at) return 'done';
  return index === at ? 'active' : 'inactive';
}

type Props = {
  /** Null before the first check-in phase arrives: every segment inactive. */
  stage: CheckInStage | null;
};

/**
 * The check-in ladder at the top of Check-in and the PIN gate: Whisper, Louder, PIN. The
 * current stage is drawn in its stage colour, earlier ones dimmed, later ones off. One
 * VoiceOver element ("Step 2 of 3: Louder").
 */
export function StageBar({ stage }: Props) {
  const index = CHECK_IN_STAGES.findIndex((entry) => entry.stage === stage);
  const label = index >= 0 ? `Step ${index + 1} of ${CHECK_IN_STAGES.length}: ${CHECK_IN_STAGES[index].label}` : 'Check-in';
  return (
    <View accessible accessibilityLabel={label} style={styles.row}>
      {CHECK_IN_STAGES.map((entry) => {
        const state = stageState(entry.stage, stage);
        const color =
          state === 'active' ? STAGE_COLORS[entry.stage] : state === 'done' ? STAGE_BAR_COLORS.done : STAGE_BAR_COLORS.inactive;
        const labelColor = state === 'active' ? STAGE_COLORS[entry.stage] : STAGE_BAR_COLORS.inactiveLabel;
        return (
          <View key={entry.stage} style={styles.segment} testID={`stage-${entry.stage}-${state}`}>
            <View style={[styles.bar, { backgroundColor: color }]} />
            <Text style={[TEXT.small, { color: labelColor, fontFamily: state === 'active' ? FONTS.manropeBold : FONTS.manropeSemiBold }]}>
              {entry.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, alignSelf: 'stretch' },
  segment: { flex: 1, gap: 6 },
  bar: { height: 4, borderRadius: 2 },
});
