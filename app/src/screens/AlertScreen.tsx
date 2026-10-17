import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ROUTES } from '../navigation/phaseNavigation';
import { describeRecipient } from '../session/describe';
import { useSessionState } from '../session/SessionStateProvider';
import { ActionButton } from '../ui/ActionButton';
import { LAYOUT, TYPE } from '../ui/theme';

// Skeleton (K3). K10 adds the full brief, live ack updates within 5 s and the Call button
// (the teammate's number in demo). Opened by PhaseNavigator on escalated and SOS. Swift never
// sends an escalation for a duress PIN, so this screen never shows one.

export default function AlertScreen() {
  const router = useRouter();
  const { phase, escalation } = useSessionState();
  const isOpen = phase?.phase === 'escalated' || phase?.phase === 'sos';
  const isSos = phase?.phase === 'sos' || escalation?.sosOpen === true;

  return (
    <ScrollView contentContainerStyle={LAYOUT.screen}>
      <Text accessibilityRole="header" style={TYPE.title}>
        {isSos ? 'SOS' : 'Alert sent'}
      </Text>
      {escalation ? (
        <View>
          <Text style={TYPE.label}>{`Status: ${escalation.state}`}</Text>
          {escalation.recipients.map((recipient) => (
            <Text key={`${recipient.kind}:${recipient.name}`} style={TYPE.value}>
              {describeRecipient(recipient)}
            </Text>
          ))}
        </View>
      ) : (
        <Text style={TYPE.body}>Waiting for the server…</Text>
      )}
      <ActionButton label="Call" isDisabled onPress={() => {}} />
      <Text style={TYPE.label}>Calling arrives with K10.</Text>
      {isOpen && <ActionButton label="Enter PIN to cancel" onPress={() => router.push(ROUTES.pin)} />}
      {!isOpen && (
        <ActionButton label="Back to session" variant="secondary" onPress={() => router.dismissTo(ROUTES.session)} />
      )}
    </ScrollView>
  );
}
