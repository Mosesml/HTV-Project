import { StyleSheet, Text, View } from 'react-native';

import { COLORS, TYPE } from '../ui/theme';

type Props = {
  label: string;
  value: string;
};

/** One reading on the Active session screen; VoiceOver reads it as "Room: 97 dB". */
export function ReadingTile({ label, value }: Props) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={styles.tile}>
      <Text style={TYPE.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    gap: 4,
    padding: 12,
    borderRadius: 12,
    backgroundColor: COLORS.card,
  },
  value: { fontSize: 22, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
