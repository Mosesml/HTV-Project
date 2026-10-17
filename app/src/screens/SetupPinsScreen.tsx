import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ROUTES } from '../navigation/phaseNavigation';
import { SetupStepFooter } from '../setup/SetupStepFooter';
import { Screen, StepProgress, TEXT } from '../ui';

// Setup step 4 of 4 (docs/design/screens/Setup-PINs.html): the safe and duress PINs (4 to 8
// digits each, and different), stored as salted hashes by usePins().store. Finish setup saves
// everything and goes Home. PLACEHOLDER from the UI foundation: the setup-home group builds
// the PIN cards and the save.

export default function SetupPinsScreen() {
  const router = useRouter();
  return (
    <Screen
      footer={<SetupStepFooter nextLabel="Finish setup" onBack={() => router.back()} onNext={() => router.dismissTo(ROUTES.home)} />}>
      <StepProgress step={4} />
      <View style={styles.intro}>
        <Text accessibilityRole="header" style={TEXT.title}>
          Two PINs
        </Text>
        <Text style={TEXT.body}>
          You&apos;ll only need one if an alert gets as far as the last step. Both look exactly the same to anyone watching.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 10 },
});
