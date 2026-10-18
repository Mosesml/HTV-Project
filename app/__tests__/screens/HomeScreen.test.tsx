import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';

import type { Settings } from '../../modules/raveguard-native';
import { appPinStore } from '../../src/pin/PinStoreProvider';
import { DEFAULT_SETTINGS } from '../../src/settings/defaults';
import { addRecipient } from '../../src/settings/recipients';
import { fakeFileSystem, seedSavedSettings } from '../../test-utils/fakeFiles';
import { calledMethods, nativeMock, PHASES } from '../../test-utils/nativeMock';
import { emitPhase, renderApp } from '../../test-utils/renderApp';

// Home (docs/design/screens/Home.html). The `/` gate in front of it is tested in
// __tests__/navigation/HomeRoute.test.tsx.

const SAVED: Settings = addRecipient(
  addRecipient({ ...DEFAULT_SETTINGS, wearerName: 'Alex' }, { name: 'Maya Chen', phone: '+14165550101', kind: 'contact' }),
  { name: 'Theo Park', phone: '+14165550102', kind: 'contact' }
);

beforeEach(async () => {
  nativeMock().reset();
  fakeFileSystem().reset();
  await appPinStore().clearPins();
});

afterEach(() => jest.restoreAllMocks());

describe('Home', () => {
  test('shows the app name without a personalized greeting', async () => {
    seedSavedSettings(SAVED);
    await renderApp('/');
    expect(screen.queryByText(/^Tonight, /)).toBeNull();
    expect(screen.getByRole('header', { name: 'RaveGuard' })).toBeTruthy();
  });

  test('shows the check-in interval and the alert chain', async () => {
    seedSavedSettings(SAVED);
    await renderApp('/');
    expect(screen.getByLabelText('Check-ins every 30 min, Whispered in your ear. Nod twice to answer.')).toBeTruthy();
    expect(screen.getByLabelText('Alert chain, Maya → Theo')).toBeTruthy();
  });

  test('the alert chain calls venue staff what they are', async () => {
    seedSavedSettings(addRecipient({ ...SAVED, intervalMin: 60 }, { name: 'Main stage medical', phone: '+14165550110', kind: 'venueStaff' }));
    await renderApp('/');
    expect(screen.getByLabelText('Alert chain, Maya → Theo → Venue staff')).toBeTruthy();
    expect(screen.getByLabelText(/^Check-ins every 60 min/)).toBeTruthy();
  });

  test('shows the AirPods connection from onAirPods', async () => {
    seedSavedSettings(SAVED);
    await renderApp('/');
    expect(screen.getByLabelText('AirPods, Checked when the session starts')).toBeTruthy();
    await act(async () => nativeMock().emit('onAirPods', { connected: true }));
    expect(screen.getByLabelText('AirPods, Connected · head motion streaming')).toBeTruthy();
    await act(async () => nativeMock().emit('onAirPods', { connected: false }));
    expect(screen.getByLabelText('AirPods, Not connected')).toBeTruthy();
  });

  test('reads the AirPods connection from the snapshot', async () => {
    seedSavedSettings(SAVED);
    await renderApp('/', { airPodsConnected: true });
    expect(screen.getByLabelText('AirPods, Connected · head motion streaming')).toBeTruthy();
  });

  test('shows hearing protection from the snapshot, then from onNoise', async () => {
    seedSavedSettings(SAVED);
    await renderApp('/');
    expect(screen.getByLabelText('Hearing protection, Off')).toBeTruthy();
    await act(async () => nativeMock().emit('onNoise', { backend: 'bridge', connected: true, level: 2 }));
    expect(screen.getByLabelText('Hearing protection, Bridge · connected')).toBeTruthy();
    await act(async () => nativeMock().emit('onNoise', { backend: 'shortcuts', connected: false, level: 0 }));
    expect(screen.getByLabelText('Hearing protection, Shortcuts · not connected')).toBeTruthy();
  });

  test('hearing protection reads "—" (no reading yet) when the snapshot fails', async () => {
    jest.spyOn(nativeMock(), 'getSnapshot').mockRejectedValue(new Error('not ready'));
    seedSavedSettings(SAVED);
    await renderApp('/');
    expect(screen.getByLabelText('Hearing protection, no reading yet')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
  });

  test('Start session sends the saved settings and starts; monitoring opens Active session', async () => {
    seedSavedSettings(SAVED);
    const app = await renderApp('/');
    fireEvent.press(screen.getByRole('button', { name: 'Start session' }));
    await waitFor(() => expect(calledMethods()).toEqual(['configure', 'startSession']));
    expect(nativeMock().calls[0].args[0]).toEqual(SAVED);
    expect(app.getPathname()).toBe('/');
    await emitPhase(PHASES.monitoring);
    expect(app.getPathname()).toBe('/session');
  });

  test('a start the module refuses says so and stays Home', async () => {
    jest.spyOn(nativeMock(), 'startSession').mockRejectedValueOnce(new Error('no AirPods'));
    seedSavedSettings(SAVED);
    const app = await renderApp('/');
    fireEvent.press(screen.getByRole('button', { name: 'Start session' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't start the session (no AirPods). Try again.");
    expect(app.getPathname()).toBe('/');
    expect(screen.getByRole('button', { name: 'Start session' }).props.accessibilityState).toMatchObject({ disabled: false });
  });

  test('says when the PINs are not set, and not once they are', async () => {
    seedSavedSettings(SAVED);
    const first = await renderApp('/');
    expect(screen.getByText(/Set your PINs in Settings/)).toBeTruthy();
    first.unmount();
    await appPinStore().setPins({ safePin: '2468', duressPin: '1357' });
    await renderApp('/');
    expect(screen.queryByText(/Set your PINs in Settings/)).toBeNull();
  });

  test('Settings opens setup', async () => {
    seedSavedSettings(SAVED);
    const app = await renderApp('/');
    fireEvent.press(screen.getByRole('button', { name: 'Settings' }));
    expect(await screen.findByText('Contacts')).toBeTruthy();
    expect(app.getPathname()).toBe('/setup/contacts');
  });

  test('Debug panel opens Debug', async () => {
    seedSavedSettings(SAVED);
    const app = await renderApp('/');
    fireEvent.press(screen.getByRole('button', { name: 'Debug panel' }));
    await waitFor(() => expect(app.getPathname()).toBe('/debug'));
  });

  test('leaves session start to the Start session button', async () => {
    seedSavedSettings(SAVED);
    await renderApp('/');
    expect(screen.getByRole('button', { name: 'Start session' })).toBeTruthy();
    expect(screen.queryByText(/^Tonight, /)).toBeNull();
    expect(calledMethods()).toEqual([]);
  });
});
