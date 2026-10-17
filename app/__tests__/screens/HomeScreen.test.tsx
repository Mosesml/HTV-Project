import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';

import type { Settings } from '../../modules/raveguard-native';
import { DEFAULT_SETTINGS } from '../../src/settings/defaults';
import { addRecipient } from '../../src/settings/recipients';
import { fakeFileSystem, seedSavedSettings } from '../../test-utils/fakeFiles';
import { calledMethods, nativeMock, PHASES } from '../../test-utils/nativeMock';
import { emitPhase, renderApp } from '../../test-utils/renderApp';

// Home (placeholder from the UI foundation; the setup-home group finishes it). The `/` gate in
// front of it is tested in __tests__/navigation/HomeRoute.test.tsx.

const SAVED: Settings = addRecipient(
  addRecipient({ ...DEFAULT_SETTINGS, wearerName: 'Alex' }, { name: 'Maya Chen', phone: '+14165550101', kind: 'contact' }),
  { name: 'Theo Park', phone: '+14165550102', kind: 'contact' }
);

beforeEach(() => {
  nativeMock().reset();
  fakeFileSystem().reset();
});

describe('Home', () => {
  test('shows the check-in interval and the alert chain', async () => {
    seedSavedSettings(SAVED);
    await renderApp('/');
    expect(screen.getByLabelText('Check-ins every 30 min, Whispered in your ear. Nod to answer.')).toBeTruthy();
    expect(screen.getByLabelText('Alert chain, Maya → Theo')).toBeTruthy();
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
  });

  test('Settings opens setup', async () => {
    seedSavedSettings(SAVED);
    const app = await renderApp('/');
    fireEvent.press(screen.getByRole('button', { name: 'Settings' }));
    expect(await screen.findByText('Who gets the alert?')).toBeTruthy();
    expect(app.getPathname()).toBe('/setup/contacts');
  });

  test('Debug panel opens Debug', async () => {
    seedSavedSettings(SAVED);
    const app = await renderApp('/');
    fireEvent.press(screen.getByRole('button', { name: 'Debug panel' }));
    await waitFor(() => expect(app.getPathname()).toBe('/debug'));
  });
});
