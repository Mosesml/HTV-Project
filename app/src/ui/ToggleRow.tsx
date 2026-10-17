import { StyleSheet, Switch, Text, View } from 'react-native';

import { TYPE } from './theme';

type Props = {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** What VoiceOver (and tests) call the switch; defaults to `label`. */
  accessibilityLabel?: string;
};

/** A label on the left and a switch on the right. */
export function ToggleRow({ label, value, onValueChange, accessibilityLabel }: Props) {
  return (
    <View style={styles.row}>
      <Text style={[TYPE.body, styles.label]}>{label}</Text>
      <Switch accessibilityLabel={accessibilityLabel ?? label} onValueChange={onValueChange} value={value} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, gap: 12 },
  label: { flexShrink: 1 },
});
