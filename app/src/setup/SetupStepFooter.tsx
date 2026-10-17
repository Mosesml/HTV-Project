import { StyleSheet, View } from 'react-native';

import { IconButton, PrimaryButton, SPACE, TOUCH } from '../ui';

type Props = {
  nextLabel: string;
  onNext: () => void;
  /** Leave out on a fresh install's step 1, which has nowhere to go back to. */
  onBack?: () => void;
  /** What VoiceOver calls the Back button; default "Back". */
  backLabel?: string;
  isNextDisabled?: boolean;
};

/** The setup steps' footer: a 60 pt Back beside the full-width Next (Setup-Permissions.html). */
export function SetupStepFooter({ nextLabel, onNext, onBack, backLabel = 'Back', isNextDisabled = false }: Props) {
  return (
    <View style={styles.row}>
      {onBack !== undefined && <IconButton icon="chevronLeft" accessibilityLabel={backLabel} size={TOUCH.button} onPress={onBack} />}
      <PrimaryButton label={nextLabel} onPress={onNext} isDisabled={isNextDisabled} style={styles.next} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SPACE.md, alignItems: 'center' },
  next: { flex: 1 },
});
