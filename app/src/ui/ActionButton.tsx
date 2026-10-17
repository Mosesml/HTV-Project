import { Pressable, StyleSheet, Text } from 'react-native';

import { COLORS, MIN_TAP_TARGET } from './theme';

type Variant = 'primary' | 'danger' | 'secondary';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  isDisabled?: boolean;
};

/** The one button every screen uses: full width and at least 60 pt tall (PRD UI-7). */
export function ActionButton({ label, onPress, variant = 'primary', isDisabled = false }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={[styles.button, styles[variant], isDisabled && styles.disabled]}>
      <Text style={[styles.label, variant === 'secondary' && styles.secondaryLabel]}>{label}</Text>
    </Pressable>
  );
}

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
  disabled: { backgroundColor: COLORS.disabled, borderColor: COLORS.disabled },
  label: { color: COLORS.onPrimary, fontSize: 17, fontWeight: '600' },
  secondaryLabel: { color: COLORS.primary },
});
