import { StyleSheet, Text, View } from 'react-native';

import { InfoCallout, PALETTE, Screen, SecondaryButton, SPACE, StatusPill, TEXT } from '../ui';
import { callHint, callNote, SOS_CALL_CAPTION } from './callCopy';
import { SosCallButton } from './SosCallButton';
import type { CallTarget } from './teammateCall';

// The SOS screen's body (docs/design/screens/SOS.html), presentational, on the SOS background:
// the pill and "No one has answered yet", who was texted, the round Call for help with what it
// rings, "Read this out" for whoever picks up, and "I'm okay now" (the PIN gate).

type Props = {
  textedLine: string;
  /** The meeting spot and self-description (phoneSummary.ts, readThisOut). */
  readOut: string;
  callTarget: CallTarget;
  callError: string | null;
  onCall: () => void;
  onImOkay: () => void;
};

export function SosView({ textedLine, readOut, callTarget, callError, onCall, onImOkay }: Props) {
  const isReady = callTarget.kind === 'ready';
  return (
    <Screen
      tone="sos"
      testID="sos-screen"
      footer={
        <>
          <InfoCallout tone="sos" icon="mapPin" title="Read this out">
            <Text style={styles.readOut}>{readOut}</Text>
          </InfoCallout>
          <SecondaryButton tone="sos" label="I'm okay now" accessibilityHint="Opens the PIN gate" onPress={onImOkay} />
        </>
      }>
      <View style={styles.intro}>
        <StatusPill tone="alert" label="SOS" />
        <Text accessibilityRole="header" style={[TEXT.title, styles.sosText]}>
          No one has answered yet
        </Text>
        <Text style={[TEXT.body, styles.sosMuted]}>{textedLine}</Text>
      </View>

      <View style={styles.call}>
        <SosCallButton isDisabled={!isReady} accessibilityHint={callHint(callTarget)} onPress={onCall} />
        <Text style={[TEXT.captionStrong, styles.caption]}>{callNote(callTarget) ?? SOS_CALL_CAPTION}</Text>
        {callError !== null && (
          <Text accessibilityRole="alert" style={[TEXT.error, styles.centred]}>
            {callError}
          </Text>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: SPACE.md },
  sosText: { color: PALETTE.sosText },
  sosMuted: { color: PALETTE.sosTextMuted },
  // The mockup's two flex-grow spacers: the button sits centred between the heading and the card.
  call: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: SPACE.xl, paddingVertical: SPACE.lg },
  caption: { color: PALETTE.sosTextMuted, fontFamily: TEXT.label.fontFamily, textAlign: 'center' },
  centred: { textAlign: 'center' },
  readOut: { ...TEXT.bodyStrong, color: PALETTE.sosText },
});
