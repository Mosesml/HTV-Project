import { Redirect } from 'expo-router';

import HomeScreen from '../screens/HomeScreen';
import { useSettings } from '../settings/SettingsProvider';
import { Screen } from '../ui/Screen';
import { ROUTES } from './phaseNavigation';

// The `/` route: Home once settings are saved, Setup step 1 when nothing is (a fresh install,
// or after Debug's Reset settings). Shared and frozen for the screen groups: HomeScreen is the
// setup-home group's, this gate isn't. Redirect only acts while `/` is focused, so a check-in
// opened over Home at launch is never replaced by setup.

export default function HomeRoute() {
  const { isLoaded, source } = useSettings();
  // The settings file is read in a few milliseconds; an empty dark screen avoids a flash.
  if (!isLoaded) return <Screen testID="home-loading">{null}</Screen>;
  if (source === 'defaults') return <Redirect href={ROUTES.setupContacts} />;
  return <HomeScreen />;
}
