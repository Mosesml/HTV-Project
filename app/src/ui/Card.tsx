import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { PALETTE, RADII, SPACE } from './theme';

/** `default`: surface with a border; `sunken`: the borderless callout / Summary fill; `sos`: the SOS callout. */
export type CardTone = 'default' | 'sunken' | 'sos';
/** `regular`: 18 all round; `list`: tight top and bottom for a column of ListRows. */
export type CardPadding = 'regular' | 'list' | 'none';

type Props = {
  children: ReactNode;
  tone?: CardTone;
  padding?: CardPadding;
  /** Gap between children (regular padding only), default 14. */
  gap?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
  /** True groups the card into one VoiceOver element (give it an accessibilityLabel). */
  accessible?: boolean;
};

const TONES: Record<CardTone, ViewStyle> = {
  default: { backgroundColor: PALETTE.surface, borderColor: PALETTE.border, borderWidth: 1 },
  sunken: { backgroundColor: PALETTE.surfaceSunken },
  sos: { backgroundColor: PALETTE.sosSurface },
};

const PADDING: Record<CardPadding, ViewStyle> = {
  regular: { padding: 18 },
  list: { paddingVertical: SPACE.xs, paddingHorizontal: SPACE.lg },
  none: {},
};

/** A rounded panel (22 pt corners) holding rows, tiles or text. */
export function Card({ children, tone = 'default', padding = 'regular', gap = 14, style, testID, accessibilityLabel, accessible }: Props) {
  return (
    <View
      accessible={accessible}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={[styles.card, TONES[tone], PADDING[padding], padding === 'regular' && { gap }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: RADII.card },
});
