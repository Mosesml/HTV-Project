import { StyleSheet, Text, View } from 'react-native';

import { clampFraction, Ring } from './Ring';
import { NO_VALUE } from './text';
import { PALETTE, RING, TEXT } from './theme';

type Props = {
  /** Whole seconds left in the stage; null before the stage's end time is known. */
  secondsLeft: number | null;
  /** Share of the stage left, 0 to 1. */
  fraction: number;
  /** The stage colour (STAGE_COLORS). */
  color: string;
  /** Default 240, the same for every stage. */
  size?: number;
  strokeWidth?: number;
  /** What VoiceOver calls the ring. */
  accessibilityLabel?: string;
};

const PERCENT = 100;
/** Big numbers wrap badly; cap Dynamic Type inside the fixed-size ring. */
const MAX_FONT_SCALE = 1.3;

export function secondsLeftText(secondsLeft: number | null): string {
  if (secondsLeft === null) return 'Waiting for the timer';
  return `${secondsLeft} ${secondsLeft === 1 ? 'second' : 'seconds'} left`;
}

/**
 * The check-in countdown: a ring that empties clockwise and the seconds in the middle.
 * VoiceOver reads it as one progress bar whose value is "N seconds left".
 */
export function CountdownRing({
  secondsLeft,
  fraction,
  color,
  size = RING.size,
  strokeWidth = RING.strokeWidth,
  accessibilityLabel = 'Time left to answer',
}: Props) {
  const shown = clampFraction(fraction);
  const scale = size / RING.size;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: PERCENT, now: Math.round(shown * PERCENT), text: secondsLeftText(secondsLeft) }}
      testID="countdown-ring"
      style={{ width: size, height: size }}>
      <Ring size={size} strokeWidth={strokeWidth} fraction={shown} color={color} testID="countdown-ring-svg" />
      <View style={styles.centre} pointerEvents="none">
        <Text
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={[TEXT.countdown, { fontSize: TEXT.countdown.fontSize * scale, lineHeight: TEXT.countdown.lineHeight * scale }]}>
          {secondsLeft === null ? NO_VALUE : String(secondsLeft)}
        </Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[TEXT.label, styles.unit]}>
          {secondsLeft === 1 ? 'second' : 'seconds'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', gap: 2 },
  unit: { color: PALETTE.textMuted, fontFamily: TEXT.caption.fontFamily },
});
