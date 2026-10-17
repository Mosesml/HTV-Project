import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ROUTES } from '../navigation/phaseNavigation';
import { PermissionGrid } from '../setup/PermissionGrid';
import { leastTrusted, previewBrief, spokenNames } from '../setup/permissionPreview';
import { isBlankRow, setRowPermission } from '../setup/setupRows';
import { SetupStepFooter } from '../setup/SetupStepFooter';
import { useSetupStep } from '../setup/useSetupStep';
import { InfoCallout, PALETTE, Screen, SPACE, StepProgress, TEXT } from '../ui';

// Setup step 2 of 4 (docs/design/screens/Setup-Permissions.html): the four permissions per
// recipient (PermissionSet), "Get alerts" locked on, and what the least-trusted recipient's
// alert would say, so the wearer sees what "a short version" means.

export default function SetupPermissionsScreen() {
  const router = useRouter();
  const { wizard, tryLeave } = useSetupStep(2);
  const { draft } = wizard;
  // The preview's example time: when the step opened.
  const [previewAt] = useState(() => Date.now());
  const kept = draft === null ? [] : draft.recipients.filter((row) => !isBlankRow(row));
  const least = leastTrusted(kept);
  const preview = least === null || draft === null ? null : previewBrief(draft.wearerName, least.permissions, previewAt);
  const leastName = least === null ? '' : spokenNames(kept)[kept.indexOf(least)];

  const handleNext = () => {
    if (tryLeave()) router.push(ROUTES.setupSession);
  };

  return (
    <Screen footer={<SetupStepFooter nextLabel="Next: your night" onBack={() => router.back()} onNext={handleNext} />}>
      <StepProgress step={2} />
      <View style={styles.intro}>
        <Text accessibilityRole="header" style={TEXT.title}>
          What each person sees
        </Text>
        <Text style={TEXT.body}>
          Nothing leaves your phone until an alert goes out. Then each person gets only what you allow here.
        </Text>
      </View>
      {draft !== null && kept.length === 0 && (
        <InfoCallout icon="people" tone="warning">
          Nobody to set up yet. Go back a step and add who gets the alert.
        </InfoCallout>
      )}
      {kept.length > 0 && (
        <PermissionGrid
          onChange={(id, permission, value) => wizard.changeRows((rows) => setRowPermission(rows, id, permission, value))}
          rows={kept}
        />
      )}
      {preview !== null && (
        <InfoCallout title={`What ${leastName} would get`}>
          <Text style={styles.quote}>{`${preview.quote} ${preview.extra}`}</Text>
        </InfoCallout>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: SPACE.md },
  quote: { ...TEXT.body, color: PALETTE.text },
});
