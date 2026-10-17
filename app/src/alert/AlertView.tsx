import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '../ui/ActionButton';
import { COLORS, LAYOUT, TYPE } from '../ui/theme';
import type { AlertSummary, AlertTone, RecipientRow as Row } from './alertModel';
import { CallPanel } from './CallPanel';
import { RecipientRow } from './RecipientRow';
import type { CallTarget } from './teammateCall';

// The Alert screen's body (K10, PRD D10 / UI-5), presentational. Top to bottom: what is
// happening (title and status, red at SOS), who was texted and who acknowledged, Call, then
// Enter PIN while the alert is open or Back to session once it closes.

const TONE_COLORS: Record<AlertTone, string> = {
  waiting: COLORS.muted,
  sending: COLORS.primary,
  acknowledged: COLORS.success,
  closed: COLORS.muted,
  sos: COLORS.danger,
};

type Props = {
  summary: AlertSummary;
  rows: readonly Row[];
  callTarget: CallTarget;
  callError: string | null;
  onCall: () => void;
  onEnterPin: () => void;
  onBackToSession: () => void;
};

export function AlertView({ summary, rows, callTarget, callError, onCall, onEnterPin, onBackToSession }: Props) {
  const isSos = summary.tone === 'sos';
  return (
    <ScrollView contentContainerStyle={LAYOUT.screen}>
      <View
        accessible
        accessibilityLiveRegion="polite"
        style={[styles.banner, { borderLeftColor: TONE_COLORS[summary.tone] }, isSos && styles.sosBanner]}>
        <Text accessibilityRole="header" style={[TYPE.title, isSos && styles.sosText]}>
          {summary.title}
        </Text>
        <Text style={[TYPE.body, isSos && styles.sosText]}>{summary.status}</Text>
      </View>

      {rows.length > 0 && (
        <View style={styles.list}>
          <Text style={TYPE.label}>Who was texted</Text>
          {rows.map((row) => (
            <RecipientRow key={row.key} row={row} />
          ))}
        </View>
      )}

      <CallPanel target={callTarget} isSos={isSos} error={callError} onCall={onCall} />

      {summary.isOpen ? (
        <ActionButton label="Enter PIN to cancel" variant="secondary" onPress={onEnterPin} />
      ) : (
        <ActionButton label="Back to session" variant="secondary" onPress={onBackToSession} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  banner: {
    gap: 6,
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 6,
    backgroundColor: COLORS.card,
  },
  sosBanner: { backgroundColor: COLORS.danger, borderLeftColor: COLORS.danger },
  sosText: { color: COLORS.onPrimary },
  list: { gap: 8 },
});
