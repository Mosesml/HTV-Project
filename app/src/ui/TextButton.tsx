import { Pressable, StyleSheet, Text } from 'react-native';

import { PALETTE, TEXT, TOUCH } from './theme';

type Props = {
  label: string;
  onPress: () => void;
  accessibilityHint?: string;
  /** Default lavender. */
  color?: string;
  testID?: string;
};

/** A text-only link-style button ("Debug panel"), padded out to 44 pt. */
export function TextButton({ label, onPress, accessibilityHint, color = PALETTE.lavender, testID }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      testID={testID}
      style={styles.button}>
      {({ pressed }) => <Text style={[TEXT.captionStrong, { color: pressed ? PALETTE.lavenderPressed : color }]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: TOUCH.min, minWidth: TOUCH.min, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
});
