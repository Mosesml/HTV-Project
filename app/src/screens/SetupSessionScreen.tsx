import { Text } from 'react-native';
import { useRouter } from 'expo-router';

import { ROUTES } from '../navigation/phaseNavigation';
import { SetupStepFooter } from '../setup/SetupStepFooter';
import { Screen, StepProgress, TEXT } from '../ui';

// Setup step 3 of 4 (docs/design/screens/Setup-Session.html): the check-in interval (30 or
// 60 min), how loud is okay (Quieter / Balanced / Louder = 80 / 85 / 90 dB), what you're
// wearing and the optional meeting spot (Settings.meetingSpot). PLACEHOLDER from the UI
// foundation: the setup-home group builds the form.

export default function SetupSessionScreen() {
  const router = useRouter();
  return (
    <Screen
      footer={
        <SetupStepFooter nextLabel="Next: your PINs" onBack={() => router.back()} onNext={() => router.push(ROUTES.setupPins)} />
      }>
      <StepProgress step={3} />
      <Text accessibilityRole="header" style={TEXT.title}>
        Your night
      </Text>
    </Screen>
  );
}
