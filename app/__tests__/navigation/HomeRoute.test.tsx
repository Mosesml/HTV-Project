import { screen } from 'expo-router/testing-library';

import { DEFAULT_SETTINGS } from '../../src/settings/defaults';
import { fakeFileSystem, seedSavedSettings } from '../../test-utils/fakeFiles';
import { nativeMock, PHASES } from '../../test-utils/nativeMock';
import { renderApp } from '../../test-utils/renderApp';

// The `/` route (src/navigation/HomeRoute.tsx): Home once settings are saved, Setup step 1
// when nothing is. Shared: it asserts routes, not either screen's copy beyond its heading.

beforeEach(() => {
  nativeMock().reset();
  fakeFileSystem().reset();
});

describe('Home route gate', () => {
  test('a fresh install opens on Setup step 1', async () => {
    const app = await renderApp('/');
    expect(app.getPathname()).toBe('/setup/contacts');
    expect(screen.getByText('Step 1 of 4')).toBeTruthy();
  });

  test('saved settings open Home', async () => {
    seedSavedSettings({ ...DEFAULT_SETTINGS, wearerName: 'Alex' });
    const app = await renderApp('/');
    expect(app.getPathname()).toBe('/');
    expect(screen.queryByText('Step 1 of 4')).toBeNull();
  });

  test('a check-in open at launch wins over setup', async () => {
    const app = await renderApp('/', { phase: PHASES.loud });
    expect(app.getPathname()).toBe('/check-in');
  });
});
