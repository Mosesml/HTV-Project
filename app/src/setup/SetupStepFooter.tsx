import { StyleSheet, View } from 'react-native';

import { IconButton, PrimaryButton, TOUCH } from '../ui';

type Props = {
  nextLabel: string;
  onNext: () => void;
  /** Leave out on step 1, which has no Back. */
  onBack?: () => void;
  isNextDisabled?: boolean;
};

/** The setup steps' footer: a 60 pt Back beside the full-width Next (Setup-Permissions.html). */
export function SetupStepFooter({ nextLabel, onNext, onBack, isNextDisabled = false }: Props) {
  return (
    <View style={styles.row}>
      {onBack !== undefined && <IconButton icon="chevronLeft" accessibilityLabel="Back" size={TOUCH.button} onPress={onBack} />}
      <PrimaryButton label={nextLabel} onPress={onNext} isDisabled={isNextDisabled} style={styles.next} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  next: { flex: 1 },
});
