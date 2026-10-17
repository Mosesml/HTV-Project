import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ROUTES } from '../navigation/phaseNavigation';
import { usePins } from '../pin/PinStoreProvider';
import type { PinField } from '../pin/pinRules';
import { errorMessage } from '../session/describe';
import { useSessionState } from '../session/SessionStateProvider';
import { useSettings } from '../settings/SettingsProvider';
import { PinCard } from '../setup/PinCard';
import { PinEntryPanel } from '../setup/PinEntryPanel';
import { differentCheck, otherPin, pinCardState, pinFieldError, type DifferentCheck } from '../setup/pinStep';
import { isBlankRow } from '../setup/setupRows';
import { SETUP_STEP_HREFS, SETUP_STEP_NAMES, firstStepToFix } from '../setup/setupSteps';
import { SetupStepFooter } from '../setup/SetupStepFooter';
import { SmallButton } from '../setup/SmallButton';
import { keepDraftThroughNavigation } from '../setup/setupWizardStore';
import { useSetupStep } from '../setup/useSetupStep';
import { Icon, ICON, PALETTE, Screen, SPACE, StepProgress, TEXT, type IconName } from '../ui';

// Setup step 4 of 4 (docs/design/screens/Setup-PINs.html): the safe and duress PINs (4 to 8
// digits each, and different). Change opens the PIN entry on this screen. Finish setup checks
// the whole draft (checkSetup), saves the settings (validate, write, configure()) and then the
// PINs as salted hashes (usePins().savePins), and goes Home. Blank PINs keep the stored ones.

const DIFFERENT: Record<DifferentCheck, { icon: IconName; color: string; text: string }> = {
  ok: { icon: 'check', color: PALETTE.mint, text: 'The two PINs are different' },
  same: { icon: 'warning', color: PALETTE.coral, text: 'The two PINs must be different' },
  pending: { icon: 'info', color: PALETTE.textMuted, text: 'The two PINs must be different' },
};

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

export default function SetupPinsScreen() {
  const router = useRouter();
  const { save } = useSettings();
  const { savePins } = usePins();
  const { phase } = useSessionState();
  const { wizard, check, allErrors, errors, hasPins, tryLeave } = useSetupStep(4);
  const { draft } = wizard;
  const [editing, setEditing] = useState<PinField | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isRunning = phase !== null && phase.phase !== 'idle';
  const pins = { safePin: draft?.safePin ?? '', duressPin: draft?.duressPin ?? '' };
  const elsewhere = wizard.checkedSteps.includes(4) ? firstStepToFix(allErrors) : null;
  const fixStep = elsewhere !== null && elsewhere.step !== 4 ? elsewhere : null;
  // A duress PIN alerts whoever is texted first (PRD: "skips straight to Contact 1").
  const first = draft?.recipients.find((row) => !isBlankRow(row));
  const firstWho = first === undefined ? '' : first.kind === 'contact' ? firstName(first.name) : first.name.trim();
  const contactName = firstWho === '' ? 'your first contact' : firstWho;

  const handleFinish = async () => {
    setSaveError(null);
    if (!tryLeave() || check === null || !check.ok) return;
    setIsSaving(true);
    try {
      await save(check.settings);
      if (check.pins) await savePins(check.pins);
      // Back to Home with the setup steps gone from the stack (a fresh install has no Home under them).
      if (router.canDismiss()) router.dismissAll();
      router.replace(ROUTES.home);
    } catch (error: unknown) {
      setSaveError(errorMessage(error));
      setIsSaving(false);
    }
  };

  if (editing !== null) {
    return (
      <Screen>
        <StepProgress step={4} />
        <PinEntryPanel
          field={editing}
          onCancel={() => setEditing(null)}
          onUse={(pin) => {
            wizard.change(editing === 'safePin' ? { safePin: pin } : { duressPin: pin });
            setEditing(null);
          }}
          other={pins[otherPin(editing)]}
        />
      </Screen>
    );
  }

  const different = DIFFERENT[differentCheck(pins, hasPins)];
  return (
    <Screen
      footer={
        <>
          {isRunning && <Text style={TEXT.caption}>Stop the session to change your setup.</Text>}
          {saveError !== null && (
            <Text accessibilityRole="alert" style={TEXT.error}>
              {saveError}
            </Text>
          )}
          <SetupStepFooter
            isNextDisabled={isSaving || isRunning || draft === null}
            nextLabel={isSaving ? 'Saving…' : 'Finish setup'}
            onBack={() => router.back()}
            onNext={handleFinish}
          />
        </>
      }>
      <StepProgress step={4} />
      <View style={styles.intro}>
        <Text accessibilityRole="header" style={TEXT.title}>
          Two PINs
        </Text>
        <Text style={TEXT.body}>
          You&apos;ll only need one if an alert gets as far as the last step. Both look exactly the same to anyone watching.
        </Text>
        {hasPins && <Text style={TEXT.caption}>Your PINs are set. Change them only if you want new ones.</Text>}
      </View>
      <PinCard
        description="Cancels the alert for real. Use this when you're actually okay."
        error={pinFieldError('safePin', errors, pins, hasPins)}
        field="safePin"
        onChange={() => setEditing('safePin')}
        state={pinCardState('safePin', pins.safePin, hasPins)}
      />
      <PinCard
        description={`Looks exactly like cancelling. Quietly texts ${contactName} that you need help, and tells them not to call or text you openly.`}
        error={pinFieldError('duressPin', errors, pins, hasPins)}
        field="duressPin"
        onChange={() => setEditing('duressPin')}
        state={pinCardState('duressPin', pins.duressPin, hasPins)}
      />
      <View style={styles.checks}>
        <View accessible style={styles.check}>
          <Icon color={different.color} name={different.icon} size={ICON.sizeTiny} />
          <Text style={[TEXT.captionStrong, { color: different.color }]}>{different.text}</Text>
        </View>
        <View accessible style={styles.check}>
          <Icon color={PALETTE.textMuted} name="info" size={ICON.sizeTiny} />
          <Text style={TEXT.caption}>Three wrong PINs send the alert right away.</Text>
        </View>
      </View>
      {errors.form !== undefined && <Text style={TEXT.error}>{errors.form}</Text>}
      {fixStep !== null && (
        <View style={styles.fix}>
          <Text accessibilityRole="alert" style={TEXT.error}>
            {`Check step ${fixStep.step}, ${SETUP_STEP_NAMES[fixStep.step]} ${fixStep.message}.`}
          </Text>
          <SmallButton
            label={`Go to step ${fixStep.step}`}
            onPress={() => {
              wizard.markChecked(fixStep.step);
              keepDraftThroughNavigation();
              router.dismissTo(SETUP_STEP_HREFS[fixStep.step]);
            }}
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: SPACE.md },
  checks: { gap: SPACE.md, paddingHorizontal: SPACE.xs },
  check: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  fix: { gap: SPACE.sm, alignItems: 'flex-start' },
});
