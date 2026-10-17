import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS } from './theme';

export interface Choice<T> {
  value: T;
  label: string;
}

type Props<T> = {
  choices: readonly Choice<T>[];
  selected: T;
  onSelect: (value: T) => void;
};

/** A row of radio buttons: exactly one choice is picked. */
export function ChoiceChips<T extends string | number>({ choices, selected, onSelect }: Props<T>) {
  return (
    <View accessibilityRole="radiogroup" style={styles.row}>
      {choices.map((choice) => {
        const isSelected = choice.value === selected;
        return (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected }}
            key={String(choice.value)}
            onPress={() => onSelect(choice.value)}
            style={[styles.chip, isSelected && styles.selected]}>
            <Text style={[styles.label, isSelected && styles.selectedLabel]}>{choice.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  selected: { backgroundColor: COLORS.primary },
  label: { fontSize: 17, fontWeight: '600', color: COLORS.primary },
  selectedLabel: { color: COLORS.onPrimary },
});
