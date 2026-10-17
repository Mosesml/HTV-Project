import { Pressable, StyleSheet, Text } from 'react-native';

import { CHECK_IN_BUTTON_HEIGHT, COLORS, MIN_TAP_TARGET } from './theme';

type Variant = 'primary' | 'danger' | 'secondary';
/** `large` is the Check-in screen's thumb button: full width, 120 pt, big label. */
type Size = 'regular' | 'large';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  isDisabled?: boolean;
  size?: Size;
  /** What happens on a tap, read by VoiceOver after the label. */
  accessibilityHint?: string;
};

/** The one button every screen uses: full width and at least 60 pt tall (PRD UI-7), or 120 pt when `large`. */
export function ActionButton({
  label,
  onPress,
  variant = 'primary',
  isDisabled = false,
  size = 'regular',
  accessibilityHint,
}: Props) {
  const isLarge = size === 'large';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={[styles.button, styles[variant], isLarge && styles.large, isDisabled && styles.disabled]}>
      <Text
        maxFontSizeMultiplier={isLarge ? LARGE_MAX_FONT_SCALE : undefined}
        style={[styles.label, isLarge && styles.largeLabel, variant === 'secondary' && styles.secondaryLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Keeps the large label on one line at the biggest Dynamic Type sizes. */
const LARGE_MAX_FONT_SCALE = 1.4;

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_TAP_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  primary: { backgroundColor: COLORS.primary },
  danger: { backgroundColor: COLORS.danger },
  secondary: { borderWidth: 2, borderColor: COLORS.primary },
  large: { minHeight: CHECK_IN_BUTTON_HEIGHT, alignSelf: 'stretch', borderRadius: 24 },
  disabled: { backgroundColor: COLORS.disabled, borderColor: COLORS.disabled },
  label: { color: COLORS.onPrimary, fontSize: 17, fontWeight: '600' },
  largeLabel: { fontSize: 32, fontWeight: '700' },
  secondaryLabel: { color: COLORS.primary },
});
