import { Pressable, StyleSheet } from 'react-native';

import { Icon } from './Icon';
import type { IconName } from './icons';
import { ICON, PALETTE, RADII, TOUCH } from './theme';

/** `outlined`: surface with a strong border (Settings, Debug, Back); `ghost`: no fill (the drag handle). */
export type IconButtonVariant = 'outlined' | 'ghost';

type Props = {
  icon: IconName;
  /** Required: an icon alone says nothing to VoiceOver ("Settings", "Back"). */
  accessibilityLabel: string;
  accessibilityHint?: string;
  onPress: () => void;
  variant?: IconButtonVariant;
  /** 44 (header buttons) or 60 (Setup's Back beside the 60 pt Next). Never under 44. */
  size?: number;
  iconColor?: string;
  isDisabled?: boolean;
  testID?: string;
};

/** A square icon-only button, at least 44 pt. */
export function IconButton({
  icon,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  variant = 'outlined',
  size = TOUCH.min,
  iconColor,
  isDisabled = false,
  testID,
}: Props) {
  const side = Math.max(TOUCH.min, size);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        { width: side, height: side, borderRadius: side > TOUCH.min ? RADII.button : RADII.iconButton },
        variant === 'outlined' && styles.outlined,
        (pressed || isDisabled) && styles.dimmed,
      ]}>
      <Icon name={icon} size={ICON.sizeSmall} color={iconColor ?? (variant === 'ghost' ? PALETTE.textFaint : PALETTE.text)} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  outlined: { backgroundColor: PALETTE.surface, borderWidth: 1, borderColor: PALETTE.borderStrong },
  dimmed: { opacity: 0.6 },
});
