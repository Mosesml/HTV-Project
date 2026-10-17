import { Redirect } from 'expo-router';

import { ROUTES } from '../navigation/phaseNavigation';

// The old one-page setup's route (/setup). The four setup steps replaced the form, so the route
// now opens step 1; the route file stays so old links keep working.

export default function SetupScreen() {
  return <Redirect href={ROUTES.setupContacts} />;
}
