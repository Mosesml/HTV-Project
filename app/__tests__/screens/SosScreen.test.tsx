import { Linking } from 'react-native';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import type { Settings } from '../../modules/raveguard-native';
import { DEFAULT_SETTINGS } from '../../src/settings/defaults';
import { fakeFileSystem, seedSavedSettings } from '../../test-utils/fakeFiles';
import { nativeMock, PHASES } from '../../test-utils/nativeMock';
import { emitPhase, renderApp } from '../../test-utils/renderApp';

// SOS (placeholder from the UI foundation; the alert-sos group finishes it). Its Call keeps
// the rule Alert's has: demo mode rings the teammate, and nothing ever dials emergency services.

const TEAMMATE = '+14165550199';

function saveSettings(change: Partial<Settings>): void {
  seedSavedSettings({ ...DEFAULT_SETTINGS, ...change });
}

beforeEach(() => {
  nativeMock().reset();
  fakeFileSystem().reset();
  jest.mocked(Linking.openURL).mockClear();
});

afterEach(() => jest.restoreAllMocks());

describe('SOS screen', () => {
  test('opens on sos from wherever the wearer is', async () => {
    const app = await renderApp('/session', { phase: PHASES.escalated });
    expect(app.getPathname()).toBe('/alert');
    await emitPhase(PHASES.sos);
    expect(app.getPathname()).toBe('/sos');
    expect(screen.getByText('SOS')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'No one has answered yet' })).toBeTruthy();
  });

  test('in demo mode, Call for help rings the teammate and says it never dials emergency services', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    saveSettings({ demo: true, teammatePhone: TEAMMATE });
    await renderApp('/sos', { phase: PHASES.sos });
    const call = await screen.findByRole('button', { name: 'Call for help' });
    await waitFor(() => expect(call).toBeEnabled());
    expect(call.props.accessibilityHint).toBe('Demo mode: calls a teammate, never emergency services');
    fireEvent.press(call);
    await waitFor(() => expect(openURL).toHaveBeenCalledWith(`tel:${TEAMMATE}`));
  });

  test('outside demo mode, Call for help is off and dials nothing', async () => {
    const openURL = jest.spyOn(Linking, 'openURL');
    saveSettings({ demo: false, teammatePhone: TEAMMATE });
    await renderApp('/sos', { phase: PHASES.sos });
    expect(await screen.findByText('Calling is only on in demo mode. RaveGuard never dials emergency services.')).toBeTruthy();
    const call = screen.getByRole('button', { name: 'Call for help' });
    expect(call).toBeDisabled();
    fireEvent.press(call);
    expect(openURL).not.toHaveBeenCalled();
  });

  test('never calls on its own', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    saveSettings({ demo: true, teammatePhone: TEAMMATE });
    await renderApp('/sos', { phase: PHASES.sos });
    await emitPhase(PHASES.sos);
    expect(openURL).not.toHaveBeenCalled();
  });

  test("\"I'm okay now\" opens the PIN gate and stays there while still at SOS", async () => {
    const app = await renderApp('/sos', { phase: PHASES.sos });
    fireEvent.press(screen.getByRole('button', { name: "I'm okay now" }));
    await waitFor(() => expect(app.getPathname()).toBe('/pin'));
    await emitPhase(PHASES.sos);
    expect(app.getPathname()).toBe('/pin');
  });
});
