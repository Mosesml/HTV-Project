import { StyleSheet, Text, View } from 'react-native';

import type { EscalationEvent } from '../../modules/raveguard-native';
import { Card, InfoCallout, Screen, SecondaryButton, SPACE, StatusPill, TEXT } from '../ui';
import { alertHeading, alertPill, type AlertRecipient, type AlertSummary } from './alertModel';
import { CallPanel } from './CallPanel';
import { SUMMARY_FOOTNOTE } from './phoneSummary';
import { RecipientRow } from './RecipientRow';
import type { CallTarget } from './teammateCall';

// The Alert screen's body (docs/design/screens/Alert.html), presentational. Top to bottom: the
// pill with when the alert went out, the heading and what is happening now, who was texted and
// who is on it, the phone-side Summary, then Call for help and "I'm okay now" (the PIN gate)
// while the alert is open, or Back to session once it closes.

type Props = {
  summary: AlertSummary;
  escalation: EscalationEvent | null;
  recipients: readonly AlertRecipient[];
  /** The phone-side Summary (phoneSummary.ts). */
  summaryText: string;
  callTarget: CallTarget;
  callError: string | null;
  onCall: () => void;
  onImOkay: () => void;
  onBackToSession: () => void;
};

export function AlertView({
  summary,
  escalation,
  recipients,
  summaryText,
  callTarget,
  callError,
  onCall,
  onImOkay,
  onBackToSession,
}: Props) {
  const pill = alertPill(summary, escalation);
  const footer = summary.isOpen ? (
    <>
      <CallPanel target={callTarget} error={callError} onCall={onCall} />
      <SecondaryButton label="I'm okay now" accessibilityHint="Opens the PIN gate" onPress={onImOkay} />
    </>
  ) : (
    <SecondaryButton label="Back to session" onPress={onBackToSession} />
  );

  return (
    <Screen gap={SPACE.xl} footer={footer} testID="alert-screen">
      <View style={styles.intro}>
        <StatusPill tone={pill.tone} label={pill.label} />
        <Text accessibilityRole="header" style={TEXT.title}>
          {alertHeading(summary)}
        </Text>
        <Text accessibilityLiveRegion="polite" style={TEXT.body}>
          {summary.status}
        </Text>
      </View>

      {recipients.length > 0 && (
        <Card padding="list">
          {recipients.map((recipient, index) => (
            <RecipientRow key={recipient.key} recipient={recipient} isLast={index === recipients.length - 1} />
          ))}
        </Card>
      )}

      <InfoCallout title="Summary">
        <Text style={styles.summary}>{summaryText}</Text>
        <Text style={TEXT.small}>{SUMMARY_FOOTNOTE}</Text>
      </InfoCallout>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: SPACE.md },
  summary: { ...TEXT.label, fontFamily: TEXT.body.fontFamily },
});
