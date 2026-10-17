import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '../ui/ActionButton';
import { TYPE } from '../ui/theme';
import { SCENARIOS, scenarioLabel, TRIGGER_LABELS, type ScenarioNumber } from './scenarios';

// One button per acceptance scenario (K11). Presentational: the Debug screen decides what
// firing means (configure first from idle, then debugFire) and when it is blocked.

type Props = {
  onFire: (scenario: ScenarioNumber) => void;
  /** Why no scenario can fire right now, or null when they can. */
  blockedReason: string | null;
};

export function ScenarioButtons({ onFire, blockedReason }: Props) {
  const isBlocked = blockedReason !== null;
  return (
    <View style={styles.list}>
      {isBlocked && <Text style={TYPE.error}>{blockedReason}</Text>}
      {SCENARIOS.map((scenario) => (
        <View key={scenario.number} style={styles.item}>
          <ActionButton
            label={scenarioLabel(scenario)}
            accessibilityHint={scenario.next}
            isDisabled={isBlocked}
            onPress={() => onFire(scenario.number)}
          />
          <Text style={TYPE.label}>
            {TRIGGER_LABELS[scenario.trigger]}. {scenario.next}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  item: { gap: 4 },
});
