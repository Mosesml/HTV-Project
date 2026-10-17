import { StyleSheet, Text, View } from 'react-native';

import { COLORS } from '../ui/theme';
import { litTicks, RING_TICKS } from './countdown';

// The Check-in countdown ring (K7, PRD UI-3), drawn from plain Views so it needs no native
// drawing library (and no rebuild): RING_TICKS short bars rotated around the centre. Lit bars
// run clockwise from 12 o'clock and go dark from the end as the stage runs out. VoiceOver
// reads the ring as one progress bar, never as 60 bars.

const RING_SIZE = 260;
const TICK_WIDTH = 6;
const TICK_LENGTH = 22;
const DEGREES_PER_TICK = 360 / RING_TICKS;
const PERCENT = 100;
/** Big numbers wrap badly; cap Dynamic Type inside the fixed-size ring. */
const MAX_FONT_SCALE = 1.3;

const TICK_ANGLES = Array.from({ length: RING_TICKS }, (_, index) => index * DEGREES_PER_TICK);

type Props = {
  /** Share of the stage left, 0 to 1. */
  fraction: number;
  secondsLeft: number;
  color: string;
};

function secondsWord(seconds: number): string {
  return seconds === 1 ? 'second' : 'seconds';
}

export function CountdownRing({ fraction, secondsLeft, color }: Props) {
  const lit = litTicks(fraction);
  const unit = secondsWord(secondsLeft);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Time left to answer"
      testID="countdown-ring"
      accessibilityValue={{ min: 0, max: PERCENT, now: Math.round(fraction * PERCENT), text: `${secondsLeft} ${unit} left` }}
      style={styles.ring}>
      {TICK_ANGLES.map((angle, index) => {
        const isLit = index < lit;
        return (
          <View
            key={angle}
            testID={isLit ? 'ring-tick-lit' : 'ring-tick-unlit'}
            style={[
              styles.tick,
              { backgroundColor: isLit ? color : COLORS.nightDim },
              { transform: [{ rotate: `${angle}deg` }, { translateY: -(RING_SIZE - TICK_LENGTH) / 2 }] },
            ]}
          />
        );
      })}
      <View style={styles.centre}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.seconds}>
          {String(secondsLeft)}
        </Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.unit}>
          {unit}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { width: RING_SIZE, height: RING_SIZE, alignSelf: 'center' },
  tick: {
    position: 'absolute',
    left: (RING_SIZE - TICK_WIDTH) / 2,
    top: (RING_SIZE - TICK_LENGTH) / 2,
    width: TICK_WIDTH,
    height: TICK_LENGTH,
    borderRadius: TICK_WIDTH / 2,
  },
  centre: { ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'center' },
  seconds: { fontSize: 88, fontWeight: '700', color: COLORS.nightText, fontVariant: ['tabular-nums'] },
  unit: { fontSize: 20, color: COLORS.nightMuted },
});
