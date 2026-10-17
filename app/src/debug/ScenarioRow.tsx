import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FONTS, Icon, ICON, PALETTE, RADII, SPACE, TEXT, TOUCH } from '../ui';

// One "Fire a scenario" row (Debug.html): the number in a 34 pt chip, the title and subline,
// and a play mark. No shared row draws a number chip, so it lives here. One button for
// VoiceOver: its label is "Scenario N: Name", its hint the trigger and the next step.

/** The mockup's number chip. */
const CHIP_SIZE = 34;

type Props = {
  number: number;
  title: string;
  subtitle: string;
  accessibilityLabel: string;
  accessibilityHint: string;
  isDisabled: boolean;
  onPress: () => void;
};

export function ScenarioRow({ number, title, subtitle, accessibilityLabel, accessibilityHint, isDisabled, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, (pressed || isDisabled) && styles.dimmed]}>
      <View style={styles.chip}>
        <Text style={styles.number}>{number}</Text>
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        <Text style={TEXT.small}>{subtitle}</Text>
      </View>
      <Icon name="play" size={ICON.sizeTiny} color={PALETTE.lavender} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: TOUCH.button,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.md,
    borderRadius: RADII.field,
    borderWidth: 1,
    borderColor: PALETTE.border,
    backgroundColor: PALETTE.surface,
  },
  dimmed: { opacity: 0.6 },
  chip: {
    width: CHIP_SIZE,
    height: CHIP_SIZE,
    borderRadius: RADII.chip,
    backgroundColor: PALETTE.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  number: { ...TEXT.bodyStrong, fontFamily: FONTS.soraBold, color: PALETTE.lavender },
  text: { flex: 1, gap: SPACE.xxs },
  title: { ...TEXT.bodyStrong, fontFamily: FONTS.manropeBold },
});
