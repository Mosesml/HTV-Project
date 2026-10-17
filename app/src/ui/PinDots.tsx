import { StyleSheet, View } from 'react-native';

import { PALETTE } from './theme';

/** `large` 16 pt dots (PIN gate), `small` 14 pt (Setup's PIN cards). */
export type PinDotsSize = 'large' | 'small';

type Props = {
  /** Digits entered (or set). */
  filled: number;
  /** Dots to draw at least; grows with `filled` because PINs are 4 to 8 digits. Default 4. */
  total?: number;
  size?: PinDotsSize;
  accessibilityLabel?: string;
};

const SIZES: Record<PinDotsSize, { dot: number; gap: number }> = { large: { dot: 16, gap: 18 }, small: { dot: 14, gap: 10 } };

/** How many digits are in, as dots. Never shows the digits. One VoiceOver element. */
export function PinDots({ filled, total = 4, size = 'large', accessibilityLabel }: Props) {
  const count = Math.max(total, filled);
  const metrics = SIZES[size];
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? `${filled} of ${count} digits entered`}
      style={[styles.row, { gap: metrics.gap }, size === 'large' && styles.centered]}>
      {Array.from({ length: count }, (_, index) => {
        const isFilled = index < filled;
        return (
          <View
            key={index}
            testID={isFilled ? 'pin-dot-filled' : 'pin-dot-empty'}
            style={[
              { width: metrics.dot, height: metrics.dot, borderRadius: metrics.dot / 2 },
              isFilled ? styles.filled : styles.empty,
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  centered: { justifyContent: 'center', paddingVertical: 8 },
  filled: { backgroundColor: PALETTE.text },
  empty: { borderWidth: 2, borderColor: PALETTE.lavenderDim },
});
