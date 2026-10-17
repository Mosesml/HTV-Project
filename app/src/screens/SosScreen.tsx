import { useRouter } from 'expo-router';

import { sosTextedLine } from '../alert/alertModel';
import { readThisOut } from '../alert/phoneSummary';
import { SosView } from '../alert/SosView';
import { useTeammateCall } from '../alert/useTeammateCall';
import { ROUTES } from '../navigation/phaseNavigation';
import { useSessionState } from '../session/SessionStateProvider';
import { useSettings } from '../settings/SettingsProvider';

// SOS (docs/design/screens/SOS.html), opened by PhaseNavigator on `sos`: nobody has
// acknowledged, so the one big action is Call for help. It never dials emergency services: in
// demo mode it rings the teammate's number (src/alert/teammateCall.ts), otherwise it is off.
// "Read this out" gives whoever picks up the meeting spot and what the wearer has on.
// "I'm okay now" opens the PIN gate (Kean's decision).

export default function SosScreen() {
  const router = useRouter();
  const { escalation } = useSessionState();
  const { settings } = useSettings();
  const { target, error, call } = useTeammateCall();

  return (
    <SosView
      textedLine={sosTextedLine(escalation)}
      readOut={readThisOut(settings)}
      callTarget={target}
      callError={error}
      onCall={call}
      onImOkay={() => router.push(ROUTES.pin)}
    />
  );
}
