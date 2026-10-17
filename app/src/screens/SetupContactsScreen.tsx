import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ROUTES } from '../navigation/phaseNavigation';
import { SetupStepFooter } from '../setup/SetupStepFooter';
import { InfoCallout, Screen, SecondaryButton, StepProgress, TEXT } from '../ui';

// Setup step 1 of 4 (docs/design/screens/Setup-Contacts.html): who gets the alert, in texting
// order (Contact 1, Contact 2, venue staff), reordered by drag or VoiceOver's move actions.
// PLACEHOLDER from the UI foundation: the setup-home group builds the list. Until then
// "One-page setup" opens the pre-redesign form, so the app can still be set up.

export default function SetupContactsScreen() {
  const router = useRouter();
  return (
    <Screen footer={<SetupStepFooter nextLabel="Next: who sees what" onNext={() => router.push(ROUTES.setupPermissions)} />}>
      <StepProgress step={1} />
      <View style={styles.intro}>
        <Text accessibilityRole="header" style={TEXT.title}>
          Who gets the alert?
        </Text>
        <Text style={TEXT.body}>
          If you miss a check-in, we text them in this order. Each one gets 2 minutes to say they&apos;re on it before the
          next is texted.
        </Text>
      </View>
      <InfoCallout icon="phone">
        If nobody answers, your phone opens a screen with a one-tap call for help. We never dial emergency services on our own.
      </InfoCallout>
      <SecondaryButton label="One-page setup" onPress={() => router.push(ROUTES.setupLegacy)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 10 },
});
