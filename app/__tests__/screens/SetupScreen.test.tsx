import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import type { Settings } from '../../modules/raveguard-native';
import { appPinStore } from '../../src/pin/PinStoreProvider';
import { DEFAULT_SETTINGS } from '../../src/settings/defaults';
import { addRecipient } from '../../src/settings/recipients';
import { fakeFileSystem, seedSavedSettings, SETTINGS_URI } from '../../test-utils/fakeFiles';
import { calledMethods, nativeMock, PHASES } from '../../test-utils/nativeMock';
import { renderApp } from '../../test-utils/renderApp';

const SAVED: Settings = addRecipient(
  addRecipient(
    { ...DEFAULT_SETTINGS, wearerName: 'Alex', intervalMin: 60, loudnessTarget: 90, demo: false },
    { name: 'Sam', phone: '+14165550101', kind: 'contact' }
  ),
  { name: 'Front desk', phone: '+14165550103', kind: 'venueStaff' }
);

beforeEach(async () => {
  nativeMock().reset();
  fakeFileSystem().reset();
  await appPinStore().clearPins();
});

// The pre-redesign one-page setup, now at /setup until the four setup steps replace it. The
// app itself opens on Home, or on Setup step 1 when nothing is saved (HomeRoute.test.tsx).
describe('Setup screen (one page, /setup)', () => {
  test('is reachable at /setup', async () => {
    const app = await renderApp('/setup');
    expect(app.getPathname()).toBe('/setup');
    expect(screen.getByText('Set up RaveGuard')).toBeTruthy();
  });

  test('a fresh install shows the setup form instead of Start session (K5)', async () => {
    await renderApp('/setup');
    expect(screen.getByRole('button', { name: 'Save setup' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start session' })).toBeNull();
  });

  test('Start session sends the saved settings, then starts and opens the session', async () => {
    seedSavedSettings(SAVED);
    const app = await renderApp('/setup');
    fireEvent.press(screen.getByRole('button', { name: 'Start session' }));
    expect(await screen.findByText('Session running')).toBeTruthy();
    expect(calledMethods()).toEqual(['configure', 'startSession']);
    expect(app.getPathname()).toBe('/session');
  });

  test('Start session sends the saved settings after a relaunch', async () => {
    seedSavedSettings(SAVED);
    await renderApp('/setup');
    fireEvent.press(screen.getByRole('button', { name: 'Start session' }));
    expect(await screen.findByText('Session running')).toBeTruthy();
    expect(nativeMock().calls[0]).toEqual({ method: 'configure', args: [SAVED] });
  });

  test('shows a summary of the saved settings', async () => {
    seedSavedSettings(SAVED);
    await renderApp('/setup');
    expect(screen.getByText('Wearer: Alex')).toBeTruthy();
    expect(screen.getByText('Check-in every 60 min · loudness target 90 dB · real timings')).toBeTruthy();
    expect(screen.getByText('1. Sam (contact)')).toBeTruthy();
    expect(screen.getByText('2. Front desk (venue staff)')).toBeTruthy();
    expect(screen.getAllByText('Gets alerts, can resolve')).toHaveLength(2);
    expect(screen.queryByText(/Not set up yet/)).toBeNull();
  });

  test('says when the PINs are not set', async () => {
    seedSavedSettings(SAVED);
    await renderApp('/setup');
    expect(screen.getByText('PINs not set: tap Edit setup to add them.')).toBeTruthy();
  });

  test('says when nothing has been saved yet', async () => {
    await renderApp('/setup');
    expect(screen.getByText('Not set up yet. This takes under a minute.')).toBeTruthy();
  });

  test('says when the saved settings could not be used', async () => {
    fakeFileSystem().seed(SETTINGS_URI, 'not json');
    await renderApp('/setup');
    expect(screen.getByText(/Saved settings are damaged/)).toBeTruthy();
  });

  test('shows the error when the module refuses to start', async () => {
    jest.spyOn(nativeMock(), 'startSession').mockRejectedValueOnce(new Error('no AirPods'));
    seedSavedSettings(SAVED);
    const app = await renderApp('/setup');
    fireEvent.press(screen.getByRole('button', { name: 'Start session' }));
    expect(await screen.findByText('no AirPods')).toBeTruthy();
    expect(app.getPathname()).toBe('/setup');
  });

  test('opens the session screen at launch when a session is already running', async () => {
    const app = await renderApp('/setup', { phase: PHASES.monitoring });
    expect(app.getPathname()).toBe('/session');
  });

  test('links to Debug', async () => {
    const app = await renderApp('/setup');
    fireEvent.press(screen.getByRole('button', { name: 'Debug' }));
    await waitFor(() => expect(app.getPathname()).toBe('/debug'));
  });
});
