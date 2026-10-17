import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ROUTES } from '../navigation/phaseNavigation';
import { MAX_NAME_LENGTH } from '../settings/defaults';
import { useSettings } from '../settings/SettingsProvider';
import { RecipientList } from '../setup/RecipientList';
import { SetupStepFooter } from '../setup/SetupStepFooter';
import { useSetupStep } from '../setup/useSetupStep';
import { InfoCallout, Screen, SPACE, StepProgress, TEXT, TextField } from '../ui';

// Setup step 1 of 4 (docs/design/screens/Setup-Contacts.html): your name (the mockups never ask
// for it; it starts every alert) and who gets the alert, in texting order. Rows reorder by drag,
// by VoiceOver's Move up / Move down, or with the buttons in an opened row. Entering setup
// starts a fresh draft from the saved settings (setupWizardStore.ts); nothing is saved until
// Finish on step 4.

export default function SetupContactsScreen() {
  const router = useRouter();
  const { problem } = useSettings();
  const { wizard, errors, tryLeave } = useSetupStep(1);
  const { draft, isEditing } = wizard;
  const hasErrors = Object.keys(errors).length > 0;

  const handleNext = () => {
    if (tryLeave()) router.push(ROUTES.setupPermissions);
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
            nextLabel="Next: who sees what"
            onBack={isEditing ? handleBack : undefined}
            onNext={handleNext}
          />
        </>
      }>
      <StepProgress step={1} />
      <View style={styles.intro}>
        <Text accessibilityRole="header" style={TEXT.title}>
          Who gets the alert?
        </Text>
        <Text style={TEXT.body}>
          If you miss a check-in, we text them in this order. Each one gets 2 minutes to say they&apos;re on it before the
          next is texted.
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
            helper="It starts every alert, so your people know who it's about."
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
      <InfoCallout icon="phone">
        If nobody answers, your phone opens a screen with a one-tap call for help. We never dial emergency services on our own.
      </InfoCallout>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: SPACE.md },
});
