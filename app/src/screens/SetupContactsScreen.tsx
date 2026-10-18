import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ROUTES } from '../navigation/phaseNavigation';
import { MAX_NAME_LENGTH } from '../settings/defaults';
import { useSettings } from '../settings/SettingsProvider';
import { RecipientList } from '../setup/RecipientList';
import { SetupStepFooter } from '../setup/SetupStepFooter';
import { useSetupStep } from '../setup/useSetupStep';
import { InfoCallout, Screen, SPACE, StepProgress, TEXT, TextField } from '../ui';

// Setup step 1 of 3: your name and contacts in alert order. Rows reorder by drag,
// by VoiceOver's Move up / Move down, or with the buttons in an opened row. Entering setup
// starts a fresh draft from the saved settings (setupWizardStore.ts); nothing is saved until
// Save on step 3.

export default function SetupContactsScreen() {
  const router = useRouter();
  const { problem } = useSettings();
  const { wizard, errors, tryLeave } = useSetupStep(1);
  const { draft, isEditing } = wizard;
  const hasErrors = Object.keys(errors).length > 0;

  const handleNext = () => {
    if (tryLeave()) router.push(ROUTES.setupSession);
  };
  // Editing a saved setup can be left without saving; a fresh install has nowhere to go back to.
  const handleBack = () => (router.canGoBack() ? router.back() : router.replace(ROUTES.home));

  return (
    <Screen
      footer={
        <>
          {hasErrors && (
            <Text accessibilityRole="alert" style={TEXT.error}>
              Fix the fields marked in red to go on.
            </Text>
          )}
          <SetupStepFooter
            backLabel="Back to Home"
            nextLabel="Next: session settings"
            onBack={isEditing ? handleBack : undefined}
            onNext={handleNext}
          />
        </>
      }>
      <StepProgress step={1} />
      <View style={styles.intro}>
        <Text accessibilityRole="header" style={TEXT.title}>
          Contacts
        </Text>
        <Text style={TEXT.body}>
          We text contacts in order if you miss a check-in. They receive your location and alert details.
        </Text>
      </View>
      {problem !== null && (
        <InfoCallout icon="warning" tone="warning">
          {problem}
        </InfoCallout>
      )}
      {draft !== null && (
        <>
          <TextField
            autoCapitalize="words"
            error={errors.wearerName}
            label="Your name"
            maxLength={MAX_NAME_LENGTH}
            onChangeText={(wearerName) => wizard.change({ wearerName })}
            placeholder="e.g. Alex"
            textContentType="givenName"
            value={draft.wearerName}
          />
          <RecipientList errors={errors} onRowsChange={wizard.changeRows} rows={draft.recipients} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: SPACE.md },
});
