import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from './Icon';
import type { IconName } from './icons';
import { ICON, PALETTE, RADII, SPACE, TEXT, TOUCH } from './theme';

export type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

type KeyName = Digit | 'left' | 'delete';

const ROWS: readonly (readonly KeyName[])[] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['left', '0', 'delete'],
];

/** The backspace glyph, a little over the 24 pt default as in the mockup. */
const DELETE_ICON_SIZE = 26;

/**
 * An optional key for the bottom-left slot the mockup leaves empty (the PIN gate's "Submit
 * PIN"). Coral with an onCoral icon when enabled; a faint icon on no fill, and disabled, when not.
 */
export type KeypadLeftKey = {
  label: string;
  icon: IconName;
  isEnabled: boolean;
  onPress: () => void;
};

type Props = {
  onDigit: (digit: Digit) => void;
  onDelete: () => void;
  /** Every key off (while a PIN is being checked). */
  isDisabled?: boolean;
  /** What VoiceOver calls the delete key. */
  deleteLabel?: string;
  /** Drawn in the empty bottom-left slot; that slot stays blank without it. */
  leftKey?: KeypadLeftKey;
};

type KeyVariant = 'digit' | 'plain' | 'accent';

type KeyProps = {
  label: string;
  isDisabled: boolean;
  onPress: () => void;
  variant: KeyVariant;
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
 * The PIN keypad: 1–9, 0 and delete, in a 3-column grid of 72 pt keys, plus an optional
 * `leftKey`. Every key is a button labelled with its digit, so VoiceOver and tests find "1" to
 * "0" and "Delete digit".
 */
export function Keypad({ onDigit, onDelete, isDisabled = false, deleteLabel = 'Delete digit', leftKey }: Props) {
  const renderKey = (key: KeyName) => {
    if (key === 'left') {
      if (leftKey === undefined) return <View key={key} style={styles.blank} />;
      const isReady = leftKey.isEnabled && !isDisabled;
      return (
        <Key key={key} label={leftKey.label} isDisabled={!isReady} onPress={leftKey.onPress} variant={isReady ? 'accent' : 'plain'}>
          <Icon name={leftKey.icon} size={ICON.size} color={isReady ? PALETTE.onCoral : PALETTE.textFaint} />
        </Key>
      );
    }
    if (key === 'delete') {
      return (
        <Key key={key} label={deleteLabel} isDisabled={isDisabled} onPress={onDelete} variant="plain">
          <Icon name="backspace" size={DELETE_ICON_SIZE} color={PALETTE.textMuted} />
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
  plain: { backgroundColor: 'transparent' },
  accent: { backgroundColor: PALETTE.coral },
  blank: { flex: 1, height: TOUCH.keypadKey },
  pressed: { backgroundColor: PALETTE.surface2 },
});

const VARIANT_STYLES: Record<KeyVariant, object> = { digit: styles.digit, plain: styles.plain, accent: styles.accent };
