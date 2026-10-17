import { StyleSheet, Text, View } from 'react-native';

import { COLORS, TYPE } from '../ui/theme';
import type { RecipientRow as Row } from './alertModel';

type Props = {
  row: Row;
};

/** One recipient on the Alert screen: name and kind, when texted, and the reply. */
export function RecipientRow({ row }: Props) {
  return (
    <View accessible accessibilityLabel={row.accessibilityLabel} style={[styles.row, row.isAcked && styles.acked]}>
      <View style={styles.heading}>
        <Text style={styles.name}>{row.name}</Text>
        <Text style={TYPE.label}>{row.kindLabel}</Text>
      </View>
      <Text style={[TYPE.value, !row.isTexted && styles.muted]}>{row.textedLabel}</Text>
      {row.replyLabel !== null && (
        <Text style={[TYPE.value, row.isAcked ? styles.ackText : styles.muted]}>{row.replyLabel}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 4,
    padding: 12,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  acked: { borderLeftColor: COLORS.success },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  name: { fontSize: 17, fontWeight: '600', flexShrink: 1 },
  muted: { color: COLORS.muted },
  ackText: { color: COLORS.success, fontWeight: '600' },
});
