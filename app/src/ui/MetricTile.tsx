import { StyleSheet, Text, View } from 'react-native';

import { NO_VALUE, NO_VALUE_SPOKEN } from './text';
import { PALETTE, RADII, TEXT } from './theme';

/** `regular`: Sora numbers (Active session's hearing); `mono`: JetBrains Mono readouts (Debug). */
export type MetricVariant = 'regular' | 'mono';

type Props = {
  label: string;
  /** The formatted value, or NO_VALUE ("—") when there is no reading; the unit is hidden then. */
  value: string;
  unit?: string;
  valueColor?: string;
  variant?: MetricVariant;
  accessibilityLabel?: string;
  testID?: string;
};

export function metricSpoken(label: string, value: string, unit?: string): string {
  if (value === NO_VALUE) return `${label}: ${NO_VALUE_SPOKEN}`;
  return `${label}: ${value}${unit ? ` ${unit}` : ''}`;
}

/** A tile with a small label over a big number. One VoiceOver element ("Room: 98 dB", "Room: no reading yet"). */
export function MetricTile({ label, value, unit, valueColor, variant = 'regular', accessibilityLabel, testID }: Props) {
  const isMono = variant === 'mono';
  const showUnit = unit !== undefined && value !== NO_VALUE;
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? metricSpoken(label, value, unit)}
      testID={testID}
      style={[styles.tile, isMono && styles.monoTile]}>
      <Text style={isMono ? TEXT.monoLabel : styles.label}>{label}</Text>
      <Text style={[isMono ? TEXT.mono : TEXT.metric, valueColor !== undefined && { color: valueColor }]}>
        {value}
        {showUnit && <Text style={styles.unit}>{` ${unit}`}</Text>}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, gap: 4, backgroundColor: PALETTE.surface2, borderRadius: RADII.field, padding: 14 },
  monoTile: { borderRadius: RADII.iconChip, paddingVertical: 10, paddingHorizontal: 12, gap: 2 },
  label: { ...TEXT.smallStrong, color: PALETTE.textMuted, fontFamily: TEXT.label.fontFamily },
  unit: { ...TEXT.body, fontFamily: TEXT.caption.fontFamily, color: PALETTE.textMuted, letterSpacing: 0 },
});
