import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { clampFraction } from './Ring';
import { NO_VALUE_SPOKEN } from './text';
import { PALETTE } from './theme';

type Props = {
  /** 0 to 1, or null when there is no reading (drawn empty). */
  fraction: number | null;
  /** Required: what the bar measures ("Tonight's dose"). */
  accessibilityLabel: string;
  /** What VoiceOver reads as the value; defaults to the percentage. */
  valueText?: string;
  color?: string;
  trackColor?: string;
  /** 10 (dose) or 6 (PIN gate countdown). */
  height?: number;
  style?: StyleProp<ViewStyle>;
};

const PERCENT = 100;

/** A thin horizontal bar: tonight's dose, the PIN gate's time left. One VoiceOver progress bar. */
export function ProgressBar({
  fraction,
  accessibilityLabel,
  valueText,
  color = PALETTE.lavender,
  trackColor = PALETTE.surface2,
  height = 10,
  style,
}: Props) {
  const shown = fraction === null ? 0 : clampFraction(fraction);
  const percent = Math.round(shown * PERCENT);
  const text = valueText ?? (fraction === null ? NO_VALUE_SPOKEN : `${percent} percent`);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: PERCENT, now: fraction === null ? undefined : percent, text }}
      style={[styles.track, { height, borderRadius: height / 2, backgroundColor: trackColor }, style]}>
      <View testID="progress-fill" style={{ width: `${percent}%`, height, borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { overflow: 'hidden', alignSelf: 'stretch' },
});
