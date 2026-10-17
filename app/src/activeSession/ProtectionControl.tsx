import Slider from '@react-native-community/slider';
import { StyleSheet, Text, View } from 'react-native';

import { PALETTE, SPACE, TEXT, TOUCH } from '../ui';
import { MAX_LEVEL, MIN_LEVEL } from './protectionState';
import { NO_VALUE, NOISE_CANCELLATION_FROM } from './readings';

type Props = {
  /** The level Swift reported through `onNoise`; null until it reports one. */
  level: number | null;
  /** Where the thumb sits (the wearer's level until Swift confirms it). */
  sliderLevel: number;
  onChange: (value: number) => void;
};

/** VoiceOver reads "55 points" rather than "55%": the level is a policy score, not a share of sound blocked. */
const SPOKEN_LEVELS = Array.from({ length: MAX_LEVEL - MIN_LEVEL + 1 }, (_, i) => String(MIN_LEVEL + i));
const SPOKEN_UNITS = 'points';

/**
 * The manual protection slider (PRD HRG-5), 0 to 100 in whole steps, inside the Hearing card:
 * "Protection" and the reported level, the slider, then "Hear more" and "Filter more".
 */
export function ProtectionControl({ level, sliderLevel, onChange }: Props) {
  const shownLevel = level === null ? NO_VALUE : String(level);
  return (
    <View style={styles.block}>
      <View accessible accessibilityLabel={`Protection level: ${shownLevel}`} style={styles.header}>
        <Text style={TEXT.label}>Protection</Text>
        <Text style={TEXT.labelNumeric}>{shownLevel}</Text>
      </View>
      <Slider
        accessibilityLabel="Protection level"
        accessibilityHint={`Lower hears more, higher filters more. Adaptive below ${NOISE_CANCELLATION_FROM}, Noise Cancellation from ${NOISE_CANCELLATION_FROM}.`}
        accessibilityUnits={SPOKEN_UNITS}
        accessibilityIncrements={SPOKEN_LEVELS}
        minimumValue={MIN_LEVEL}
        maximumValue={MAX_LEVEL}
        step={1}
        value={sliderLevel}
        tapToSeek
        onValueChange={onChange}
        onSlidingComplete={onChange}
        minimumTrackTintColor={PALETTE.lavender}
        maximumTrackTintColor={PALETTE.surface2}
        thumbTintColor={PALETTE.lavender}
        style={styles.slider}
      />
      <View style={styles.scale} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Text style={TEXT.small}>Hear more</Text>
        <Text style={TEXT.small}>Filter more</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: SPACE.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  // 44 pt tall so the thumb is easy to catch (the mockup draws 28).
  slider: { height: TOUCH.min },
  scale: { flexDirection: 'row', justifyContent: 'space-between' },
});
