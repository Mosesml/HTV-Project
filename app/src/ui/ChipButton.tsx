import { Pressable, StyleSheet, Text } from 'react-native';

import { COLORS } from './theme';

type Props = {
  label: string;
  onPress: () => void;
  /** What VoiceOver (and tests) call the button when `label` alone is ambiguous. */
  accessibilityLabel?: string;
};

/** A small outlined button for actions inside a form, such as Move up or Remove. */
export function ChipButton({ label, onPress, accessibilityLabel }: Props) {
  return (
    <Pressable accessibilityLabel={accessibilityLabel} accessibilityRole="button" onPress={onPress} style={styles.chip}>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  label: { fontSize: 15, fontWeight: '600', color: COLORS.primary },
});
