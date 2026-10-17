import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { callTarget, startCall, type CallTarget } from '../alert/teammateCall';
import { ROUTES } from '../navigation/phaseNavigation';
import { useSettings } from '../settings/SettingsProvider';
import { PALETTE, PrimaryButton, Screen, SecondaryButton, StatusPill, TEXT } from '../ui';

// SOS (docs/design/screens/SOS.html), opened by PhaseNavigator on `sos`: nobody has
// acknowledged, so the one big action is Call for help. It never dials emergency services: in
// demo mode it rings the teammate's number (src/alert/teammateCall.ts), otherwise it is off.
// "I'm okay now" opens the PIN gate. PLACEHOLDER from the UI foundation: the alert-sos group
// finishes it (the 232 pt round button, "Read this out" with the meeting spot and clothes).

function callCaption(target: CallTarget): string {
  switch (target.kind) {
    case 'ready':
      return 'Demo mode: calls a teammate, never emergency services';
    case 'notDemo':
      return 'Calling is only on in demo mode. RaveGuard never dials emergency services.';
    case 'noNumber':
      return "Add your teammate's number on the Debug screen to call from here.";
  }
}

export default function SosScreen() {
  const router = useRouter();
  const { settings } = useSettings();
  const [callError, setCallError] = useState<string | null>(null);
  const target = callTarget(settings);

  const handleCall = () => {
    if (target.kind !== 'ready') return;
    setCallError(null);
    startCall(target).catch(() => setCallError(`Couldn't start the call. Dial ${target.phone} yourself.`));
  };

  return (
    <Screen
      tone="sos"
      footer={<SecondaryButton tone="sos" label="I'm okay now" accessibilityHint="Opens the PIN gate" onPress={() => router.push(ROUTES.pin)} />}>
      <View style={styles.intro}>
        <StatusPill tone="alert" label="SOS" />
        <Text accessibilityRole="header" style={[TEXT.title, styles.title]}>
          No one has answered yet
        </Text>
      </View>
      <PrimaryButton
        label="Call for help"
        caption={callCaption(target)}
        tone="coral"
        size="large"
        icon="phone"
        isDisabled={target.kind !== 'ready'}
        onPress={handleCall}
      />
      {callError !== null && (
        <Text accessibilityRole="alert" style={TEXT.error}>
          {callError}
        </Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 10 },
  title: { color: PALETTE.sosText },
});
