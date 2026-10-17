import { StyleSheet, Text, View } from 'react-native';

import { NO_VALUE, NO_VALUE_SPOKEN, PALETTE, RADII, SPACE, StatusDot, TEXT, TOUCH, type StatusTone } from '../ui';

type Props = {
  title: string;
  /** The status in words ("Connected"), or NO_VALUE while unknown. */
  status: string;
  tone: StatusTone;
  testID?: string;
};

/** Mockup dot size for the mini cards. */
const DOT_SIZE = 8;

/** A mini status card (AirPods, Bridge): a dot, a title and the status. One VoiceOver element, "AirPods: Connected". */
export function StatusTile({ title, status, tone, testID }: Props) {
  return (
    <View
      accessible
      accessibilityLabel={`${title}: ${status === NO_VALUE ? NO_VALUE_SPOKEN : status}`}
      testID={testID}
      style={styles.tile}>
      <StatusDot tone={tone} size={DOT_SIZE} />
      <View style={styles.text}>
        <Text style={TEXT.captionStrong}>{title}</Text>
        <Text style={TEXT.small} numberOfLines={1}>
          {status}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm + SPACE.xxs,
    minHeight: TOUCH.min,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.md + SPACE.xxs,
    borderRadius: RADII.field,
    borderWidth: 1,
    borderColor: PALETTE.border,
    backgroundColor: PALETTE.surface,
  },
  text: { flex: 1, gap: 1 },
});
