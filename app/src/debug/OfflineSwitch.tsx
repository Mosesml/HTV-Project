import { StyleSheet, Text, View } from 'react-native';

import { ToggleRow } from '../ui/ToggleRow';
import { TYPE } from '../ui/theme';

// "Simulate offline" (K11, PRD D11, DEM-2): the backup for real airplane mode. Presentational:
// the Debug screen calls debugSetOffline and passes back what Swift's snapshot says, so the
// switch also shows scenario 4 going offline inside Swift and Stop turning it off.

const HINT = 'While on, every server call fails, as if the phone were in airplane mode. Stop session turns it off.';

type Props = {
  /** Swift's state, or null before the first snapshot. */
  isOffline: boolean | null;
  onChange: (isOffline: boolean) => void;
};

export function OfflineSwitch({ isOffline, onChange }: Props) {
  return (
    <View style={styles.group}>
      <ToggleRow label="Simulate offline" value={isOffline ?? false} onValueChange={onChange} />
      <Text style={TYPE.label}>{HINT}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 4 },
});
