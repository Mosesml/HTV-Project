import { Pressable, StyleSheet, Text } from 'react-native';

import { PALETTE, RADII, SPACE, TEXT, TOUCH } from '../ui';

type Props = {
  label: string;
  onPress: () => void;
  /** When the visible word needs more context ("Change safe PIN", "Move recipient 2 up"). */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** `coral` for Remove. */
  tone?: 'lavender' | 'coral';
  testID?: string;
};

/**
 * The setup steps' small filled chip button ("Change", "Move up", "Remove"). The mockup's
 * "Change" is 36 pt tall; this one is 44 pt, the smallest touch target.
 */
export function SmallButton({ label, onPress, accessibilityLabel, accessibilityHint, tone = 'lavender', testID }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Text style={[TEXT.captionStrong, { color: tone === 'coral' ? PALETTE.coral : PALETTE.lavender }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: TOUCH.min,
    minWidth: TOUCH.min,
    paddingHorizontal: SPACE.md,
    borderRadius: RADII.chip,
    backgroundColor: PALETTE.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.75 },
});
