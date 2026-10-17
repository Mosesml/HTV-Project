import { StyleSheet, Text, View } from 'react-native';

import { PALETTE, TEXT } from './theme';

export const SETUP_STEPS = 4;

type Props = {
  /** 1-based. */
  step: number;
  total?: number;
};

/** Setup's "Step N of 4" with one bar per step; bars up to the current step are lit. One VoiceOver element. */
export function StepProgress({ step, total = SETUP_STEPS }: Props) {
  const current = Math.min(Math.max(1, Math.round(step)), total);
  const label = `Step ${current} of ${total}`;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Setup progress"
      accessibilityValue={{ min: 1, max: total, now: current, text: label }}
      style={styles.wrap}>
      <Text style={TEXT.overline}>{label}</Text>
      <View style={styles.bars}>
        {Array.from({ length: total }, (_, index) => (
          <View
            key={index}
            testID={index < current ? 'step-bar-lit' : 'step-bar-unlit'}
            style={[styles.bar, { backgroundColor: index < current ? PALETTE.lavender : PALETTE.borderStrong }]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  bars: { flexDirection: 'row', gap: 6 },
  bar: { flex: 1, height: 4, borderRadius: 2 },
});
