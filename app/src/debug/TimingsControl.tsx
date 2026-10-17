import { StyleSheet, Text, View } from 'react-native';

import { Segmented, SPACE, TEXT } from '../ui';
import { DEMO_HINT, REAL_HINT, TIMING_OPTIONS, type TimingsChoice } from './timings';

// The demo/real Timings segments (K11, PRD UI-6, Debug.html). Presentational: the Debug
// screen saves the flag through useSettings().save, which validates, writes and sends it
// through configure(). The timings themselves are Swift's SessionTimings (see timings.ts).

type Props = {
  isDemo: boolean;
  onChange: (isDemo: boolean) => void;
};

export function TimingsControl({ isDemo, onChange }: Props) {
  return (
    <View style={styles.group}>
      <Segmented<TimingsChoice>
        accessibilityLabel="Timings"
        options={TIMING_OPTIONS}
        value={isDemo ? 'demo' : 'real'}
        onChange={(choice) => onChange(choice === 'demo')}
      />
      <Text style={TEXT.small}>{isDemo ? DEMO_HINT : REAL_HINT}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: SPACE.sm },
});
