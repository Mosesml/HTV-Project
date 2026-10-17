import Slider from '@react-native-community/slider';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, MIN_TAP_TARGET, TYPE } from '../ui/theme';
import type { ProtectionMode } from '../../modules/raveguard-native';
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
  mode: ProtectionMode;
  isSwitchingMode: boolean;
  onModeChange: (automatic: boolean) => void;
};

/** VoiceOver reads "55 points" rather than "55%": the level is a policy score, not a share of sound blocked. */
const SPOKEN_LEVELS = Array.from({ length: MAX_LEVEL - MIN_LEVEL + 1 }, (_, i) => String(MIN_LEVEL + i));
const SPOKEN_UNITS = 'points';

/** The manual protection slider (PRD HRG-5), 0 to 100 in whole steps. */
export function ProtectionControl({
  level,
  modeLine,
  sliderLevel,
  onChange,
  mode,
  isSwitchingMode,
  onModeChange,
}: Props) {
  const shownLevel = level === null ? NO_VALUE : String(level);
  return (
    <View style={styles.card}>
      <View accessible accessibilityLabel={`Protection level: ${shownLevel}`} style={styles.header}>
        <Text style={TYPE.label}>Protection level</Text>
        <Text style={styles.level}>{shownLevel}</Text>
        {modeLine && <Text style={TYPE.body}>{modeLine}</Text>}
      </View>
      <View style={styles.modePicker} accessibilityLabel="Protection mode">
        {(['auto', 'manual'] as const).map((value) => {
          const selected = mode === value;
          const label = value === 'auto' ? 'Automatic' : 'Manual';
          return (
            <Pressable
              key={value}
              disabled={isSwitchingMode}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: isSwitchingMode }}
              accessibilityHint={value === 'auto' ? 'RaveGuard adjusts protection from room loudness.' : 'You control protection with the slider.'}
              onPress={() => onModeChange(value === 'auto')}
              style={[styles.modeOption, selected && styles.modeOptionSelected, isSwitchingMode && styles.modeOptionDisabled]}>
              <Text style={[styles.modeLabel, selected && styles.modeLabelSelected]}>{label}</Text>
            </Pressable>
          );
        })}
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
  modePicker: { flexDirection: 'row', gap: 8 },
  modeOption: {
    flex: 1,
    minHeight: MIN_TAP_TARGET,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeLabel: { color: COLORS.primary, fontSize: 17, fontWeight: '600' },
  modeOptionSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  modeLabelSelected: { color: COLORS.onPrimary },
  modeOptionDisabled: { opacity: 0.55 },
});
