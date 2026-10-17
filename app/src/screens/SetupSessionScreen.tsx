import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import type { Settings } from '../../modules/raveguard-native';
import { ROUTES } from '../navigation/phaseNavigation';
import { MAX_MEETING_SPOT_LENGTH, MAX_SELF_DESCRIPTION_LENGTH } from '../settings/defaults';
import { SetupStepFooter } from '../setup/SetupStepFooter';
import { useSetupStep } from '../setup/useSetupStep';
import { Screen, Segmented, SPACE, StepProgress, TEXT, TextField, type SegmentOption } from '../ui';

// Setup step 3 of 4 (docs/design/screens/Setup-Session.html): the check-in interval (30 or 60
// min), how loud is okay (Quieter / Balanced / Louder = loudnessTarget 80 / 85 / 90 dB), what
// you're wearing (selfDescription) and the optional meeting spot (meetingSpot).

const INTERVAL_OPTIONS: readonly SegmentOption<Settings['intervalMin']>[] = [
  { value: 30, label: '30 min', accessibilityLabel: 'Every 30 min' },
  { value: 60, label: '60 min', accessibilityLabel: 'Every 60 min' },
];

/** Kean's mapping: Quieter / Balanced / Louder = 80 / 85 / 90 dB. */
const LOUDNESS_OPTIONS: readonly SegmentOption<number>[] = [
  { value: 80, label: 'Quieter', accessibilityLabel: 'Quieter, 80 dB' },
  { value: 85, label: 'Balanced', accessibilityLabel: 'Balanced, 85 dB' },
  { value: 90, label: 'Louder', accessibilityLabel: 'Louder, 90 dB' },
];

export default function SetupSessionScreen() {
  const router = useRouter();
  const { wizard, errors, tryLeave } = useSetupStep(3);
  const { draft } = wizard;
  const loudness = draft === null ? Number.NaN : Number(draft.loudnessTarget);
  const isCustomLoudness = draft !== null && !LOUDNESS_OPTIONS.some((option) => option.value === loudness);
  const hasErrors = Object.keys(errors).length > 0;

  const handleNext = () => {
    if (tryLeave()) router.push(ROUTES.setupPins);
  };

  return (
    <Screen
      footer={
        <>
          {hasErrors && (
            <Text accessibilityRole="alert" style={TEXT.error}>
              Fix the fields marked in red to go on.
            </Text>
          )}
          <SetupStepFooter nextLabel="Next: your PINs" onBack={() => router.back()} onNext={handleNext} />
        </>
      }>
      <StepProgress step={3} />
      <Text accessibilityRole="header" style={TEXT.title}>
        Your night
      </Text>
      {draft !== null && (
        <>
          <View style={styles.group}>
            <Text style={TEXT.label}>Check in with me every</Text>
            <Segmented
              accessibilityLabel="Check in with me every"
              onChange={(intervalMin) => wizard.change({ intervalMin })}
              options={INTERVAL_OPTIONS}
              value={draft.intervalMin}
            />
            <Text style={TEXT.small}>Falls and long stillness trigger a check-in at any time too.</Text>
          </View>
          <View style={styles.group}>
            <Text style={TEXT.label}>How loud is okay?</Text>
            <Segmented
              accent="blue"
              accessibilityLabel="How loud is okay?"
              onChange={(value) => wizard.change({ loudnessTarget: String(value) })}
              options={LOUDNESS_OPTIONS}
              value={loudness}
            />
            {isCustomLoudness && <Text style={TEXT.small}>{`Set to ${draft.loudnessTarget} dB before. Pick one to change it.`}</Text>}
            {errors.loudnessTarget !== undefined && <Text style={TEXT.error}>{errors.loudnessTarget}</Text>}
            <Text style={TEXT.small}>Protection still rises through the night as your dose adds up.</Text>
          </View>
          <TextField
            autoCapitalize="sentences"
            error={errors.selfDescription}
            helper="Helps a friend spot you in a crowd."
            label="What you're wearing"
            maxLength={MAX_SELF_DESCRIPTION_LENGTH}
            onChangeText={(selfDescription) => wizard.change({ selfDescription })}
            placeholder="e.g. black hoodie, white cap"
            value={draft.selfDescription}
          />
          <TextField
            autoCapitalize="sentences"
            error={errors.meetingSpot}
            helper="Indoor GPS can be off by a block. This goes in the alert."
            label="Meeting spot"
            maxLength={MAX_MEETING_SPOT_LENGTH}
            onChangeText={(meetingSpot) => wizard.change({ meetingSpot })}
            placeholder="e.g. left of the main stage, by the bar"
            tag="optional"
            value={draft.meetingSpot}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: SPACE.sm },
});
