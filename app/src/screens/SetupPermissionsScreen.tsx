import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ROUTES } from '../navigation/phaseNavigation';
import { SetupStepFooter } from '../setup/SetupStepFooter';
import { Screen, StepProgress, TEXT } from '../ui';

// Setup step 2 of 4 (docs/design/screens/Setup-Permissions.html): the four permissions per
// recipient (PermissionSet), "Get alerts" locked on, and what the least-trusted one would get.
// PLACEHOLDER from the UI foundation: the setup-home group builds the grid.

export default function SetupPermissionsScreen() {
  const router = useRouter();
  return (
    <Screen
      footer={
        <SetupStepFooter
          nextLabel="Next: your night"
          onBack={() => router.back()}
          onNext={() => router.push(ROUTES.setupSession)}
        />
      }>
      <StepProgress step={2} />
      <View style={styles.intro}>
        <Text accessibilityRole="header" style={TEXT.title}>
          What each person sees
        </Text>
        <Text style={TEXT.body}>
          Nothing leaves your phone until an alert goes out. Then each person gets only what you allow here.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 10 },
});
