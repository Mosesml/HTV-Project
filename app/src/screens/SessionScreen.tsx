import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import * as RaveGuard from '../../modules/raveguard-native';
import { ROUTES } from '../navigation/phaseNavigation';
import { errorMessage, phaseLabel } from '../session/describe';
import { useSessionState } from '../session/SessionStateProvider';
import { ActionButton } from '../ui/ActionButton';
import { LAYOUT, TYPE } from '../ui/theme';

// Skeleton (K3). K8 adds room dB, protection level and the manual slider, dose, motion state
// and the next check-in (PRD UI-2).

const STOP_REFUSED = 'Answer the check-in or alert first, then stop the session.';

export default function SessionScreen() {
  const router = useRouter();
  const { phase } = useSessionState();
  const [message, setMessage] = useState<string | null>(null);

  const handleStop = async () => {
    setMessage(null);
    try {
      const isStopped = await RaveGuard.stopSession();
      if (isStopped) {
        router.dismissTo(ROUTES.setup);
      } else {
        setMessage(STOP_REFUSED);
      }
    } catch (e: unknown) {
      setMessage(errorMessage(e));
    }
  };

  return (
    <ScrollView contentContainerStyle={LAYOUT.screen}>
      <Text style={TYPE.title}>Session running</Text>
      <View>
        <Text style={TYPE.label}>Status</Text>
        <Text style={TYPE.value}>{phaseLabel(phase)}</Text>
      </View>
      {message && <Text style={TYPE.error}>{message}</Text>}
      <ActionButton label="Stop session" variant="danger" onPress={handleStop} />
      <ActionButton label="Debug" variant="secondary" onPress={() => router.push(ROUTES.debug)} />
    </ScrollView>
  );
}
