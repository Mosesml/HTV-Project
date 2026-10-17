import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from './Icon';
import type { IconName } from './icons';
import { buttonHint } from './PrimaryButton';
import { ICON, PALETTE, RADII, TEXT, TOUCH } from './theme';

/** `default`: surface fill and a strong border; `emphasis`: the thicker Stop session outline; `sos`: outline on the SOS background. */
export type SecondaryTone = 'default' | 'emphasis' | 'sos';
/** `regular` 56 pt ("I'm okay now"), `large` 64 pt (Stop session, Back to my session). */
export type SecondarySize = 'regular' | 'large';

type Props = {
  label: string;
  onPress: () => void;
  tone?: SecondaryTone;
  size?: SecondarySize;
  icon?: IconName;
  iconColor?: string;
  /** Anything drawn before the label, e.g. Stop session's coral square. */
  leading?: ReactNode;
  caption?: string;
  isDisabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const HEIGHTS: Record<SecondarySize, number> = { regular: TOUCH.buttonSecondary, large: 64 };

const TONES: Record<SecondaryTone, ViewStyle> = {
  default: { backgroundColor: PALETTE.surface, borderColor: PALETTE.borderStrong, borderWidth: 1 },
  emphasis: { backgroundColor: PALETTE.surface, borderColor: PALETTE.borderEmphasis, borderWidth: 1.5 },
  sos: { backgroundColor: 'transparent', borderColor: PALETTE.sosBorder, borderWidth: 1 },
};

/** The outlined button: "I'm okay now", Stop session, Back. Full width, 56 pt or 64 pt tall. */
export function SecondaryButton({
  label,
  onPress,
  tone = 'default',
  size = 'regular',
  icon,
  iconColor,
  leading,
  caption,
  isDisabled = false,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: Props) {
  const textColor = isDisabled ? PALETTE.textFaint : tone === 'sos' ? PALETTE.sosText : PALETTE.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={buttonHint(caption, accessibilityHint)}
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        TONES[tone],
        { minHeight: HEIGHTS[size], borderRadius: size === 'large' ? RADII.card : RADII.button },
        pressed && !isDisabled && styles.pressed,
        style,
      ]}>
      {leading}
      {icon !== undefined && <Icon name={icon} size={ICON.sizeSmall} color={iconColor ?? textColor} />}
      <Text style={[size === 'large' ? styles.labelLarge : styles.label, { color: textColor }]}>{label}</Text>
      {caption !== undefined && <Text style={[TEXT.small, styles.caption]}>{caption}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  label: { ...TEXT.button, fontSize: 16 },
  labelLarge: { ...TEXT.button, fontSize: 18 },
  caption: { width: '100%', textAlign: 'center' },
  pressed: { opacity: 0.8 },
});
