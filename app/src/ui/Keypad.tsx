import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from './Icon';
import { PALETTE, RADII, TEXT, TOUCH } from './theme';

export type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

const ROWS: readonly (readonly (Digit | null | 'delete')[])[] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  [null, '0', 'delete'],
];

type Props = {
  onDigit: (digit: Digit) => void;
  onDelete: () => void;
  isDisabled?: boolean;
  /** What VoiceOver calls the delete key. */
  deleteLabel?: string;
};

/**
 * The PIN keypad: 1–9, 0 and delete, in a 3-column grid of 72 pt keys. Every key is a button
 * labelled with its digit, so VoiceOver and tests find "1" to "0" and "Delete digit".
 */
export function Keypad({ onDigit, onDelete, isDisabled = false, deleteLabel = 'Delete digit' }: Props) {
  return (
    <View style={styles.grid}>
      {ROWS.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((key, keyIndex) => {
            if (key === null) return <View key={`blank-${keyIndex}`} style={styles.blank} />;
            const isDelete = key === 'delete';
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isDelete ? deleteLabel : key}
                accessibilityState={{ disabled: isDisabled }}
                disabled={isDisabled}
                key={key}
                onPress={() => (isDelete ? onDelete() : onDigit(key))}
                style={({ pressed }) => [styles.key, isDelete ? styles.deleteKey : styles.digitKey, pressed && styles.pressed]}>
                {isDelete ? (
                  <Icon name="backspace" size={26} color={PALETTE.textMuted} />
                ) : (
                  <Text maxFontSizeMultiplier={1.2} style={TEXT.keypadDigit}>
                    {key}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 12, alignSelf: 'stretch' },
  row: { flexDirection: 'row', gap: 12 },
  key: { flex: 1, height: TOUCH.keypadKey, borderRadius: RADII.card, alignItems: 'center', justifyContent: 'center' },
  digitKey: { backgroundColor: PALETTE.surface },
  deleteKey: { backgroundColor: 'transparent' },
  blank: { flex: 1, height: TOUCH.keypadKey },
  pressed: { backgroundColor: PALETTE.surface2 },
});
