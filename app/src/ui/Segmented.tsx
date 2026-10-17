import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PALETTE, RADII, TEXT, TOUCH } from './theme';

export interface SegmentOption<T> {
  value: T;
  label: string;
  /** What VoiceOver says, when the label alone is too short ("Real · 7 min"). */
  accessibilityLabel?: string;
}

/** The selected segment's fill: lavender (default) or blue (loudness, noise backend). */
export type SegmentAccent = 'lavender' | 'blue';

type Props<T> = {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accent?: SegmentAccent;
  /** Names the group for VoiceOver ("Check in with me every"). */
  accessibilityLabel?: string;
  isDisabled?: boolean;
  testID?: string;
};

const ACCENTS: Record<SegmentAccent, string> = { lavender: PALETTE.lavender, blue: PALETTE.blue };

/** A segmented control: one choice of two or three, as radio buttons, each 44 pt tall. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  accent = 'lavender',
  accessibilityLabel,
  isDisabled = false,
  testID,
}: Props<T>) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} testID={testID} style={styles.group}>
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <Pressable
            accessibilityRole="radio"
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityState={{ checked: isSelected, disabled: isDisabled }}
            disabled={isDisabled}
            key={String(option.value)}
            onPress={() => onChange(option.value)}
            style={[styles.segment, isSelected && { backgroundColor: ACCENTS[accent] }]}>
            <Text style={[styles.label, isSelected && styles.selectedLabel]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    gap: 6,
    padding: 5,
    borderRadius: RADII.field,
    borderWidth: 1,
    borderColor: PALETTE.border,
    backgroundColor: PALETTE.surface,
  },
  segment: { flex: 1, minHeight: TOUCH.min, borderRadius: RADII.iconChip, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  label: { ...TEXT.bodyStrong, textAlign: 'center' },
  selectedLabel: { ...TEXT.bodyStrong, fontFamily: TEXT.labelNumeric.fontFamily, color: PALETTE.onLavender, textAlign: 'center' },
});
