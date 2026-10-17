import { useState } from 'react';
import { useRouter } from 'expo-router';

import { AlertView } from '../alert/AlertView';
import { recipientRows, summarizeAlert } from '../alert/alertModel';
import { callTarget, startCall } from '../alert/teammateCall';
import { ROUTES } from '../navigation/phaseNavigation';
import { useSessionState } from '../session/SessionStateProvider';
import { useSettings } from '../settings/SettingsProvider';

// Alert (K10, PRD D10 / UI-5): who was texted, who acknowledged, the escalation's state and
// SOS, and Call (the teammate's number, demo mode only). Opened by PhaseNavigator on
// `escalated` and `sos`. Acks arrive through `onEscalation` (SessionStateProvider), which
// Swift sends after each status poll (every 3 s), so an ack shows here within 5 s.
// Swift never sends an escalation for a duress PIN, so this screen never shows one.

export default function AlertScreen() {
  const router = useRouter();
  const { phase, escalation } = useSessionState();
  const { settings } = useSettings();
  const [callError, setCallError] = useState<string | null>(null);

  const summary = summarizeAlert(phase, escalation);
  const rows = recipientRows(escalation?.recipients ?? []);
  const target = callTarget(settings);

  const handleCall = () => {
    if (target.kind !== 'ready') return;
    setCallError(null);
    startCall(target).catch(() => setCallError(`Couldn't start the call. Dial ${target.phone} yourself.`));
  };

  return (
    <AlertView
      summary={summary}
      rows={rows}
      callTarget={target}
      callError={callError}
      onCall={handleCall}
      onEnterPin={() => router.push(ROUTES.pin)}
      onBackToSession={() => router.dismissTo(ROUTES.session)}
    />
  );
}
