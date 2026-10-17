import { StyleSheet, View } from 'react-native';

import { Icon } from './Icon';
import type { IconName } from './icons';
import { ICON, PALETTE, RADII } from './theme';

type Props = {
  icon: IconName;
  /** The icon's colour, default lavender (blue for hearing and AirPods in the mockups). */
  color?: string;
  /** The chip's fill, default surface2. */
  background?: string;
  /** 40 (Home rows) or 34 (PIN cards, scenario numbers). */
  size?: number;
};

/** A rounded square with an icon in it, as at the start of Home's rows. Decorative. */
export function IconChip({ icon, color = PALETTE.lavender, background = PALETTE.surface2, size = 40 }: Props) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.chip, { width: size, height: size, backgroundColor: background, borderRadius: size >= 40 ? RADII.iconChip : 11 }]}>
      <Icon name={icon} size={size >= 40 ? ICON.sizeSmall : ICON.sizeTiny} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});
