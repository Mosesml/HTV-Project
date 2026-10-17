import { StyleSheet, Text, View } from 'react-native';

import { SPACE, TEXT } from '../ui';
import { ScenarioRow } from './ScenarioRow';
import {
  SCENARIOS,
  scenarioHint,
  scenarioLabel,
  scenarioSummary,
  type ScenarioNames,
  type ScenarioNumber,
} from './scenarios';

// The seven "Fire a scenario" rows (K11, Debug.html). Presentational: the Debug screen
// decides what firing means (configure first from idle, then debugFire) and when it is blocked.

type Props = {
  onFire: (scenario: ScenarioNumber) => void;
  /** Why no scenario can fire right now, or null when they can. */
  blockedReason: string | null;
  /** Who the sublines name (the first two recipients by texting order). */
  names: ScenarioNames;
};

export function ScenarioButtons({ onFire, blockedReason, names }: Props) {
  const isBlocked = blockedReason !== null;
  return (
    <View style={styles.list}>
      {isBlocked && <Text style={TEXT.error}>{blockedReason}</Text>}
      {SCENARIOS.map((scenario) => (
        <ScenarioRow
          key={scenario.number}
          number={scenario.number}
          title={scenario.name}
          subtitle={scenarioSummary(scenario, names)}
          accessibilityLabel={scenarioLabel(scenario)}
          accessibilityHint={scenarioHint(scenario)}
          isDisabled={isBlocked}
          onPress={() => onFire(scenario.number)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: SPACE.md },
});
