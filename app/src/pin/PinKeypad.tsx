import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, ICON, PALETTE, RADII, SPACE, TEXT, TOUCH, type Digit } from '../ui';

// The PIN gate's keypad (PIN-Gate.html): the shared Keypad's 3 x 4 grid of 72 pt keys, with
// a Submit key in the bottom-left slot the mockup leaves empty. PINs are 4 to 8 digits and
// the store keeps only salted hashes, so the screen can't know when an entry is complete:
// the wearer says so with Submit (docs/overnight/UI-pin-cancel.md, decision 1). The shared
// `ui/Keypad` has no slot for it; this file goes once it does (sharedChangesNeeded).

type KeyName = Digit | 'submit' | 'delete';

const ROWS: readonly (readonly KeyName[])[] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['submit', '0', 'delete'],
];

/** The backspace glyph, a little over the 24 pt default as in the mockup. */
const DELETE_ICON_SIZE = 26;

type Props = {
  onDigit: (digit: Digit) => void;
  onDelete: () => void;
  onSubmit: () => void;
  /** True once the entry is long enough to be a PIN (4 digits). */
  canSubmit: boolean;
  /** Every key off, while the PIN is being checked. */
  isDisabled?: boolean;
};

type KeyProps = {
  label: string;
  isDisabled: boolean;
  onPress: () => void;
  variant: 'digit' | 'delete' | 'submit';
  children: ReactNode;
};

function Key({ label, isDisabled, onPress, variant, children }: KeyProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [styles.key, VARIANT_STYLES[variant], pressed && !isDisabled && styles.pressed]}>
      {children}
    </Pressable>
  );
}

/**
 * Digits 1–9 and 0 (buttons named by their digit), "Delete digit" and "Submit PIN". Submit is
 * coral (the PIN stage's colour) once `canSubmit`, and a faint check on no fill before.
 */
export function PinKeypad({ onDigit, onDelete, onSubmit, canSubmit, isDisabled = false }: Props) {
  const renderKey = (key: KeyName) => {
    if (key === 'delete') {
      return (
        <Key key={key} label="Delete digit" isDisabled={isDisabled} onPress={onDelete} variant="delete">
          <Icon name="backspace" size={DELETE_ICON_SIZE} color={PALETTE.textMuted} />
        </Key>
      );
    }
    if (key === 'submit') {
      const isReady = canSubmit && !isDisabled;
      return (
        <Key key={key} label="Submit PIN" isDisabled={!isReady} onPress={onSubmit} variant={isReady ? 'submit' : 'delete'}>
          <Icon name="check" size={ICON.size} color={isReady ? PALETTE.onCoral : PALETTE.textFaint} />
        </Key>
      );
    }
    return (
      <Key key={key} label={key} isDisabled={isDisabled} onPress={() => onDigit(key)} variant="digit">
        <Text maxFontSizeMultiplier={1.2} style={TEXT.keypadDigit}>
          {key}
        </Text>
      </Key>
    );
  };

  return (
    <View style={styles.grid}>
      {ROWS.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map(renderKey)}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: SPACE.md, alignSelf: 'stretch' },
  row: { flexDirection: 'row', gap: SPACE.md },
  key: { flex: 1, height: TOUCH.keypadKey, borderRadius: RADII.card, alignItems: 'center', justifyContent: 'center' },
  digit: { backgroundColor: PALETTE.surface },
  delete: { backgroundColor: 'transparent' },
  submit: { backgroundColor: PALETTE.coral },
  pressed: { backgroundColor: PALETTE.surface2 },
});

const VARIANT_STYLES = { digit: styles.digit, delete: styles.delete, submit: styles.submit } as const;
