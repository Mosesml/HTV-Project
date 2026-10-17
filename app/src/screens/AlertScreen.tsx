import { useRouter } from 'expo-router';

import { AlertView } from '../alert/AlertView';
import { alertRecipients, summarizeAlert } from '../alert/alertModel';
import { phoneSummary } from '../alert/phoneSummary';
import { useTeammateCall } from '../alert/useTeammateCall';
import { ROUTES } from '../navigation/phaseNavigation';
import { useSessionState } from '../session/SessionStateProvider';
import { useSettings } from '../settings/SettingsProvider';

// Alert (K10, PRD D10 / UI-5; docs/design/screens/Alert.html): who was texted, who is on it,
// a phone-side Summary, and Call for help (the teammate's number, demo mode only). Opened by
// PhaseNavigator on `escalated`; at `sos` it hands over to the SOS screen. Acks arrive through
// `onEscalation` (SessionStateProvider), which Swift sends after each status poll (every 3 s),
// so an ack shows here within 5 s. Swift never sends an escalation for a duress PIN, so this
// screen never shows one. "I'm okay now" opens the PIN gate (Kean's decision).

export default function AlertScreen() {
  const router = useRouter();
  const { phase, escalation } = useSessionState();
  const { settings } = useSettings();
  const { target, error, call } = useTeammateCall();

  return (
    <AlertView
      summary={summarizeAlert(phase, escalation)}
      escalation={escalation}
      recipients={alertRecipients(escalation)}
      summaryText={phoneSummary(settings, phase?.trigger ?? null)}
      callTarget={target}
      callError={error}
      onCall={call}
      onImOkay={() => router.push(ROUTES.pin)}
      onBackToSession={() => router.dismissTo(ROUTES.session)}
    />
  );
}
