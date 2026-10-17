import { StyleSheet, Text, View } from 'react-native';

import { FONTS, RADII, recipientColor } from './theme';

/** `number`: Setup's rounded square with the texting order; `letter`: a circle with the initial (permissions, Alert). */
export type AvatarVariant = 'number' | 'letter';

type Props = {
  /** The recipient's position, 0 = texted first. Picks the colour (lavender, blue, then surface). */
  index: number;
  variant?: AvatarVariant;
  /** Used for the letter; ignored for `number`. */
  name?: string;
  /** Default 32. */
  size?: number;
  testID?: string;
};

export function avatarText(variant: AvatarVariant, index: number, name?: string): string {
  if (variant === 'number') return String(index + 1);
  const initial = name?.trim().charAt(0) ?? '';
  return initial === '' ? '?' : initial.toLocaleUpperCase();
}

/** A recipient's chip, coloured by texting order. Decorative: the row it sits in names the person. */
export function Avatar({ index, variant = 'number', name, size = 32, testID }: Props) {
  const colors = recipientColor(index);
  const isNumber = variant === 'number';
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: isNumber ? RADII.chip : size / 2,
          backgroundColor: colors.background,
        },
      ]}>
      <Text style={[styles.text, { color: colors.text, fontFamily: isNumber ? FONTS.soraBold : FONTS.manropeBold, fontSize: isNumber ? 15 : 13 }]}>
        {avatarText(variant, index, name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  text: { includeFontPadding: false },
});
