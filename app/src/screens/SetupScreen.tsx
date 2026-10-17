import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useRouter } from 'expo-router';

import * as RaveGuard from '../../modules/raveguard-native';
import { ROUTES } from '../navigation/phaseNavigation';
import { usePins } from '../pin/PinStoreProvider';
import { errorMessage } from '../session/describe';
import { useSessionState } from '../session/SessionStateProvider';
import type { LoadedSettings } from '../settings/settingsStore';
import { useSettings } from '../settings/SettingsProvider';
import { SetupForm } from '../setup/SetupForm';
import { SetupSummary } from '../setup/SetupSummary';
import { ActionButton } from '../ui/ActionButton';
import { LAYOUT, TYPE } from '../ui/theme';

// Setup (K5). With nothing saved (a fresh install, or after Debug's Reset settings) it opens
// the setup form; once saved it shows the summary with Start session and Edit setup. Editing
// is off while a session runs, because configure() mid-session moves the next check-in.

export default function SetupScreen() {
  const router = useRouter();
  const { phase } = useSessionState();
  const { settings, source, problem, isLoaded } = useSettings();
  const { hasPins } = usePins();
  const [isEditing, setIsEditing] = useState(false);
  const [shownSource, setShownSource] = useState<LoadedSettings['source'] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isRunning = phase !== null && phase.phase !== 'idle';

  // Open the form whenever the settings become the defaults (launch with nothing saved, or a
  // reset). A save that lands while the form is open never closes it: only onSaved does.
  if (isLoaded && source !== shownSource) {
    setShownSource(source);
    if (source === 'defaults') setIsEditing(true);
  }

  const handleStart = async () => {
    setError(null);
    try {
      if (!isRunning) {
        // Settings go down right before a start, so a fresh launch never runs on stale ones.
        await RaveGuard.configure(settings);
        await RaveGuard.startSession();
      }
      router.push(ROUTES.session);
    } catch (e: unknown) {
      setError(errorMessage(e));
    }
  };

  const handleSaved = () => {
    setIsEditing(false);
    setNotice('Setup saved.');
  };

  const handleEdit = () => {
    setNotice(null);
    setError(null);
    setIsEditing(true);
  };

  const debugButton = <ActionButton label="Debug" variant="secondary" onPress={() => router.push(ROUTES.debug)} />;

  if (!isLoaded) {
    return (
      <ScrollView contentContainerStyle={LAYOUT.screen}>
        <Text style={TYPE.title}>Set up RaveGuard</Text>
        <Text style={TYPE.body}>Loading settings…</Text>
      </ScrollView>
    );
  }

  if (isEditing && !isRunning) {
    return (
      <ScrollView contentContainerStyle={LAYOUT.screen} keyboardShouldPersistTaps="handled">
        <Text style={TYPE.title}>Set up RaveGuard</Text>
        {source === 'defaults' && <Text style={TYPE.body}>Not set up yet. This takes under a minute.</Text>}
        {problem && <Text style={TYPE.error}>{problem}</Text>}
        <SetupForm onCancel={source === 'saved' ? () => setIsEditing(false) : undefined} onSaved={handleSaved} />
        {debugButton}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={LAYOUT.screen}>
      <Text style={TYPE.title}>Set up RaveGuard</Text>
      {notice && <Text style={TYPE.body}>{notice}</Text>}
      <SetupSummary hasPins={hasPins} settings={settings} />
      {problem && <Text style={TYPE.error}>{problem}</Text>}
      {error && <Text style={TYPE.error}>{error}</Text>}
      <ActionButton label={isRunning ? 'Open session' : 'Start session'} onPress={handleStart} />
      <ActionButton isDisabled={isRunning} label="Edit setup" variant="secondary" onPress={handleEdit} />
      {isRunning && <Text style={TYPE.label}>Stop the session to change your setup.</Text>}
      {debugButton}
    </ScrollView>
  );
}
