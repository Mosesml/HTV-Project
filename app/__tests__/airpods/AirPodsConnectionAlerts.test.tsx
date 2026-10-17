import { Alert } from 'react-native';
import { act } from 'expo-router/testing-library';

import { AIRPODS_CONNECTED } from '../../src/airpods/airPodsAlerts';
import { nativeMock, PHASES } from '../../test-utils/nativeMock';
import { renderApp } from '../../test-utils/renderApp';

beforeEach(() => nativeMock().reset());
afterEach(() => jest.restoreAllMocks());

describe('AirPodsConnectionAlerts in the app', () => {
  test('the root layout shows the AirPods dialogs on any screen', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await renderApp('/debug', { airPodsConnected: null });
    expect(alert).not.toHaveBeenCalled();
    await act(async () => nativeMock().emit('onAirPods', { connected: true }));
    expect(alert.mock.calls).toEqual([[AIRPODS_CONNECTED.title, AIRPODS_CONNECTED.message]]);
  });

  test('a relaunch mid-session with the AirPods already in shows no dialog', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await renderApp('/session', { phase: PHASES.monitoring, airPodsConnected: true });
    await act(async () => nativeMock().emit('onAirPods', { connected: true }));
    expect(alert).not.toHaveBeenCalled();
  });
});
