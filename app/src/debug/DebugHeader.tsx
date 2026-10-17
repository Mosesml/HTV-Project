import { StyleSheet, Text, View } from 'react-native';

import { IconButton, SPACE, StatusPill, TEXT } from '../ui';

// The Debug panel's header (Debug.html): Back, the heading, and the amber "Simulated" tag
// that says everything fired from here is a simulated event, not a real detection.

type Props = {
  onBack: () => void;
};

export function DebugHeader({ onBack }: Props) {
  return (
    <View style={styles.row}>
      <IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={onBack} />
      <Text accessibilityRole="header" style={[TEXT.titleSmall, styles.title]}>
        Debug
      </Text>
      <StatusPill tone="warning" label="Simulated" accessibilityLabel="Simulated: scenarios here are test events" />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  title: { flex: 1 },
});
