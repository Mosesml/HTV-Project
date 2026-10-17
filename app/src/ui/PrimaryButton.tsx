import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { Icon } from './Icon';
import type { IconName } from './icons';
import { ICON, PALETTE, RADII, TEXT, TOUCH } from './theme';

export type PrimaryTone = 'lavender' | 'coral';
/** `regular` 60 pt (footers), `large` 72 pt (Start session, Call for help), `huge` 96 pt (Check-in's "I'm okay"). */
export type PrimarySize = 'regular' | 'large' | 'huge';

type Props = {
  label: string;
  onPress: () => void;
  tone?: PrimaryTone;
  size?: PrimarySize;
  /** A second, smaller line under the label ("Cancel the check-in", "Demo: calls a teammate"). */
  caption?: string;
  icon?: IconName;
  isDisabled?: boolean;
  /** Defaults to `label`; the caption is read as part of the hint. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const HEIGHTS: Record<PrimarySize, number> = { regular: TOUCH.button, large: TOUCH.buttonLarge, huge: TOUCH.checkIn };
const RADIUS: Record<PrimarySize, number> = { regular: RADII.button, large: RADII.buttonLarge, huge: RADII.buttonHuge };
const LABEL: Record<PrimarySize, TextStyle> = { regular: TEXT.button, large: TEXT.buttonLarge, huge: TEXT.buttonHuge };

const TONES: Record<PrimaryTone, { background: string; text: string; caption: string }> = {
  lavender: { background: PALETTE.lavender, text: PALETTE.onLavender, caption: PALETTE.onLavenderMuted },
  coral: { background: PALETTE.coral, text: PALETTE.onCoral, caption: PALETTE.onCoralMuted },
};

/** Keeps big labels on their lines at the largest Dynamic Type sizes. */
const MAX_FONT_SCALE = 1.4;

/** Joins the caption and the hint into what VoiceOver reads after the label. */
export function buttonHint(caption?: string, hint?: string): string | undefined {
  const parts = [caption, hint].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join('. ') : undefined;
}

/**
 * The filled button: lavender by default, coral for Call for help and SOS. Full width, at
 * least 60 pt tall (72 and 96 for the larger sizes), with an optional icon and a second line.
 */
export function PrimaryButton({
  label,
  onPress,
  tone = 'lavender',
  size = 'regular',
  caption,
  icon,
  isDisabled = false,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: Props) {
  const colors = TONES[tone];
  const textColor = isDisabled ? PALETTE.textFaint : colors.text;
  const captionColor = isDisabled ? PALETTE.textFaint : colors.caption;
  const iconSize = size === 'regular' ? ICON.sizeSmall : ICON.size;
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
        { minHeight: HEIGHTS[size], borderRadius: RADIUS[size], backgroundColor: colors.background },
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}>
      {icon !== undefined && <Icon name={icon} size={iconSize} color={textColor} />}
      <View style={[styles.labels, icon !== undefined && caption !== undefined && styles.labelsBesideIcon]}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[LABEL[size], { color: textColor }]}>
          {label}
        </Text>
        {caption !== undefined && (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[TEXT.buttonCaption, { color: captionColor }]}>
            {caption}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  labels: { alignItems: 'center', gap: 2 },
  labelsBesideIcon: { alignItems: 'flex-start' },
  disabled: { backgroundColor: PALETTE.borderStrong },
  pressed: { opacity: 0.85 },
});
