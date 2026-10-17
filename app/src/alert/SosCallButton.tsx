import { Pressable, StyleSheet, Text } from 'react-native';

import { Icon, PALETTE, SOS_CALL, SPACE, TEXT } from '../ui';
import { CALL_LABEL } from './callCopy';

// SOS's one big action (docs/design/screens/SOS.html): a 232 pt coral circle inside a 10 pt
// ring, the phone icon over "Call for help". Its sizes are the theme's SOS_CALL token.

/** Keeps the label inside the circle at the largest Dynamic Type sizes. */
const MAX_FONT_SCALE = 1.3;

type Props = {
  onPress: () => void;
  isDisabled?: boolean;
  accessibilityHint?: string;
  testID?: string;
};

export function SosCallButton({ onPress, isDisabled = false, accessibilityHint, testID }: Props) {
  const color = isDisabled ? PALETTE.sosTextMuted : PALETTE.onCoral;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={CALL_LABEL}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.button, isDisabled && styles.disabled, pressed && !isDisabled && styles.pressed]}>
      <Icon name="phone" size={SOS_CALL.iconSize} color={color} />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[TEXT.buttonHuge, { color }]}>
        {CALL_LABEL}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: SOS_CALL.size,
    height: SOS_CALL.size,
    borderRadius: SOS_CALL.size / 2,
    borderWidth: SOS_CALL.ringWidth,
    borderColor: PALETTE.sosBorder,
    backgroundColor: PALETTE.coral,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.sm,
  },
  disabled: { backgroundColor: PALETTE.sosSurface },
  pressed: { opacity: 0.85 },
});
