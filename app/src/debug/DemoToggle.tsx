import { StyleSheet, Text, View } from 'react-native';

import { ToggleRow } from '../ui/ToggleRow';
import { TYPE } from '../ui/theme';

// The demo/real timing toggle (K11, PRD UI-6). Presentational: the Debug screen saves the
// flag through useSettings().save, which validates, writes and sends it through configure().
// The timings themselves are Swift's SessionTimings (SessionManagerConfig.swift).

const DEMO_HINT =
  'Demo: 10 s stages and a 15 s PIN gate, check-ins only from the scenario buttons, Call rings the teammate.';
const REAL_HINT = 'Real timings: full-length stages and a check-in every interval. Call is off.';

type Props = {
  isDemo: boolean;
  onChange: (isDemo: boolean) => void;
};

export function DemoToggle({ isDemo, onChange }: Props) {
  return (
    <View style={styles.group}>
      <ToggleRow label="Demo timings" value={isDemo} onValueChange={onChange} />
      <Text style={TYPE.label}>{isDemo ? DEMO_HINT : REAL_HINT}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 4 },
});
