import Slider from '@react-native-community/slider';
import { StyleSheet, Text, View } from 'react-native';

import { COLORS, MIN_TAP_TARGET, TYPE } from '../ui/theme';
import { MAX_LEVEL, MIN_LEVEL } from './protectionState';
import { NO_VALUE, NOISE_CANCELLATION_FROM } from './readings';

type Props = {
  /** The level Swift reported through `onNoise`; null until it reports one. */
  level: number | null;
  /** Under the level: the AirPods mode and how it gets there, once known. */
  modeLine: string | null;
  /** Where the thumb sits (the wearer's level until Swift confirms it). */
  sliderLevel: number;
  onChange: (value: number) => void;
};

/** VoiceOver reads "55 points" rather than "55%": the level is a policy score, not a share of sound blocked. */
const SPOKEN_LEVELS = Array.from({ length: MAX_LEVEL - MIN_LEVEL + 1 }, (_, i) => String(MIN_LEVEL + i));
const SPOKEN_UNITS = 'points';

/** The manual protection slider (PRD HRG-5), 0 to 100 in whole steps. */
export function ProtectionControl({ level, modeLine, sliderLevel, onChange }: Props) {
  const shownLevel = level === null ? NO_VALUE : String(level);
  return (
    <View style={styles.card}>
      <View accessible accessibilityLabel={`Protection level: ${shownLevel}`} style={styles.header}>
        <Text style={TYPE.label}>Protection level</Text>
        <Text style={styles.level}>{shownLevel}</Text>
        {modeLine && <Text style={TYPE.body}>{modeLine}</Text>}
      </View>
      <Slider
        accessibilityLabel="Protection level"
        accessibilityHint={`Adaptive below ${NOISE_CANCELLATION_FROM}, Noise Cancellation from ${NOISE_CANCELLATION_FROM}.`}
        accessibilityUnits={SPOKEN_UNITS}
        accessibilityIncrements={SPOKEN_LEVELS}
        minimumValue={MIN_LEVEL}
        maximumValue={MAX_LEVEL}
        step={1}
        value={sliderLevel}
        tapToSeek
        onValueChange={onChange}
        onSlidingComplete={onChange}
        minimumTrackTintColor={COLORS.primary}
        maximumTrackTintColor={COLORS.border}
        style={styles.slider}
      />
      <View style={styles.scale} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Text style={TYPE.label}>{MIN_LEVEL} · Adaptive</Text>
        <Text style={TYPE.label}>
          {NOISE_CANCELLATION_FROM}+ · Noise Cancellation
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8, padding: 16, borderRadius: 12, backgroundColor: COLORS.card },
  header: { gap: 2 },
  level: { fontSize: 44, fontWeight: '700', fontVariant: ['tabular-nums'] },
  slider: { height: MIN_TAP_TARGET },
  scale: { flexDirection: 'row', justifyContent: 'space-between' },
});
