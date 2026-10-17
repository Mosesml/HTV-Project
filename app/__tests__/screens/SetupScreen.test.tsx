import { screen } from 'expo-router/testing-library';

import { DEFAULT_SETTINGS } from '../../src/settings/defaults';
import { fakeFileSystem, seedSavedSettings } from '../../test-utils/fakeFiles';
import { nativeMock, PHASES } from '../../test-utils/nativeMock';
import { renderApp } from '../../test-utils/renderApp';

// The old one-page setup's route (/setup). The four setup steps replaced the form (their
// behaviour is in __tests__/setup/SetupWizard.test.tsx), so the route opens step 1.

beforeEach(() => {
  nativeMock().reset();
  fakeFileSystem().reset();
});

describe('/setup', () => {
  test('opens Setup step 1 on a fresh install', async () => {
    const app = await renderApp('/setup');
    expect(app.getPathname()).toBe('/setup/contacts');
    expect(screen.getByText('Step 1 of 4')).toBeTruthy();
  });

  test('opens Setup step 1 with the saved settings filled in', async () => {
    seedSavedSettings({ ...DEFAULT_SETTINGS, wearerName: 'Alex' });
    const app = await renderApp('/setup');
    expect(app.getPathname()).toBe('/setup/contacts');
    expect(screen.getByLabelText('Your name').props.value).toBe('Alex');
  });

  test('opens the session screen at launch when a session is already running', async () => {
    const app = await renderApp('/setup', { phase: PHASES.monitoring });
    expect(app.getPathname()).toBe('/session');
  });
});
