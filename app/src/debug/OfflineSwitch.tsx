import { StyleSheet, Text, View } from 'react-native';

import { Card, PALETTE, RADII, SPACE, TEXT, Toggle } from '../ui';

// "Simulate offline" (K11, PRD D11, DEM-2, Debug.html): the backup for real airplane mode.
// Presentational: the Debug screen calls debugSetOffline and passes back what Swift's
// snapshot says, so the switch also shows scenario 4 going offline inside Swift and Stop
// turning it off. The switch carries the words for VoiceOver; the row's text is visual.

const SUBTITLE = 'Backup if airplane mode fails on stage';
const HINT = 'While on, every server call fails, as if the phone were in airplane mode. Stop session turns it off.';

type Props = {
  /** Swift's state, or null before the first snapshot. */
  isOffline: boolean | null;
  onChange: (isOffline: boolean) => void;
};

export function OfflineSwitch({ isOffline, onChange }: Props) {
  return (
    <Card padding="none" style={styles.row}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.text}>
        <Text style={styles.title}>Simulate offline</Text>
        <Text style={TEXT.small}>{SUBTITLE}</Text>
      </View>
      <Toggle
        size="large"
        accessibilityLabel="Simulate offline"
        accessibilityHint={`${SUBTITLE}. ${HINT}`}
        value={isOffline ?? false}
        onValueChange={onChange}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.md,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADII.field,
  },
  text: { flex: 1, gap: SPACE.xxs },
  title: { ...TEXT.labelNumeric, color: PALETTE.text },
});
