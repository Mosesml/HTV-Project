import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LayoutAnimationConfig } from 'react-native-reanimated';

import type { Settings } from '../../modules/raveguard-native';
import { ROUTES } from '../navigation/phaseNavigation';
import { MAX_MEETING_SPOT_LENGTH, MAX_NAME_LENGTH, MAX_SELF_DESCRIPTION_LENGTH } from '../settings/defaults';
import { SetupStepFooter } from '../setup/SetupStepFooter';
import { useSetupStep } from '../setup/useSetupStep';
import { SettingsTransition } from '../setup/SettingsTransition';
import { Screen, Segmented, SPACE, StepProgress, TEXT, TextField, Toggle, type SegmentOption } from '../ui';

// Setup step 2 of 3: the check-in interval (30 or 60
// min), how loud is okay (Quieter / Balanced / Louder = loudnessTarget 80 / 85 / 90 dB), what
// you're wearing (selfDescription), the optional meeting spot (meetingSpot), and the opt-in to be a
// nearby responder for other wearers (J15).

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
  const { wizard, errors, tryLeave } = useSetupStep(2);
  const { draft } = wizard;
  const loudness = draft === null ? Number.NaN : Number(draft.loudnessTarget);
  const isCustomLoudness = draft !== null && !LOUDNESS_OPTIONS.some((option) => option.value === loudness);
  const hasErrors = Object.keys(errors).length > 0;

  const handleNext = () => {
    if (tryLeave()) router.push(ROUTES.setupPins);
  };

  return (
    <LayoutAnimationConfig skipEntering skipExiting>
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
        <StepProgress step={2} />
        <Text accessibilityRole="header" style={TEXT.title}>
          Session settings
        </Text>
        {draft !== null && (
          <>
            <View style={styles.group}>
              <Text style={TEXT.label}>Check-in interval</Text>
              <Segmented
                accessibilityLabel="Check in with me every"
                onChange={(intervalMin) => wizard.change({ intervalMin })}
                options={INTERVAL_OPTIONS}
                value={draft.intervalMin}
              />
            </View>
            <View style={styles.group}>
              <Text style={TEXT.label}>Sound level</Text>
              <Segmented
                accent="blue"
                accessibilityLabel="How loud is okay?"
                onChange={(value) => wizard.change({ loudnessTarget: String(value) })}
                options={LOUDNESS_OPTIONS}
                value={loudness}
              />
              {isCustomLoudness && <Text style={TEXT.small}>{`Current: ${draft.loudnessTarget} dB`}</Text>}
              {errors.loudnessTarget !== undefined && <Text style={TEXT.error}>{errors.loudnessTarget}</Text>}
            </View>
            <TextField
              autoCapitalize="sentences"
              error={errors.selfDescription}
              label="What you're wearing"
              maxLength={MAX_SELF_DESCRIPTION_LENGTH}
              onChangeText={(selfDescription) => wizard.change({ selfDescription })}
              placeholder="e.g. black hoodie, white cap"
              value={draft.selfDescription}
            />
            <TextField
              autoCapitalize="sentences"
              error={errors.meetingSpot}
              label="Meeting spot"
              maxLength={MAX_MEETING_SPOT_LENGTH}
              onChangeText={(meetingSpot) => wizard.change({ meetingSpot })}
              placeholder="e.g. left of the main stage, by the bar"
              tag="optional"
              value={draft.meetingSpot}
            />
            <View style={styles.group}>
              <View style={styles.row}>
                <Text style={[TEXT.label, styles.grow]}>Be a nearby responder</Text>
                <Toggle
                  accessibilityHint="Get a text if someone near you has an unanswered alert"
                  accessibilityLabel="Be a nearby responder"
                  onValueChange={(responderEnabled) => wizard.change({ responderEnabled })}
                  value={draft.responderEnabled}
                />
              </View>
              <Text style={TEXT.small}>
                Get texts when someone nearby needs help. Shares your approximate location during your session.
              </Text>
              {draft.responderEnabled && (
                <SettingsTransition>
                  <View style={styles.group}>
                    <TextField
                      autoCapitalize="words"
                      error={errors.responderName}
                      label="Responder name"
                      maxLength={MAX_NAME_LENGTH}
                      onChangeText={(responderName) => wizard.change({ responderName })}
                      value={draft.responderName}
                    />
                    <TextField
                      error={errors.responderPhone}
                      keyboardType="phone-pad"
                      label="Responder phone number"
                      onChangeText={(responderPhone) => wizard.change({ responderPhone })}
                      placeholder="e.g. 416 555 0123"
                      value={draft.responderPhone}
                    />
                  </View>
                </SettingsTransition>
              )}
            </View>
          </>
        )}
      </Screen>
    </LayoutAnimationConfig>
  );
}

const styles = StyleSheet.create({
  group: { gap: SPACE.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  grow: { flex: 1 },
});
