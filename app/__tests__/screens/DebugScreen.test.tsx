import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { calledMethods, nativeMock, PHASES } from '../../test-utils/nativeMock';
import { emitMotion, emitPhase, renderApp } from '../../test-utils/renderApp';

const FALL_SCENARIO = 2;

beforeEach(() => nativeMock().reset());

describe('Debug screen (the K2 smoke buttons, for K11 to grow)', () => {
  test('shows the phase and a live motion readout', async () => {
    await renderApp('/debug', { phase: PHASES.monitoring });
    expect(screen.getByText('monitoring')).toBeTruthy();
    await emitMotion({ state: 'dancing', pitch: 12.34, roll: -5, accelG: 1.2, at: 0 });
    expect(screen.getByText('dancing · pitch 12.3° · roll -5.0° · 1.20 g')).toBeTruthy();
  });

  test('Start session (demo) configures and starts the module', async () => {
    await renderApp('/debug');
    fireEvent.press(screen.getByRole('button', { name: 'Start session (demo)' }));
    await waitFor(() => expect(calledMethods()).toEqual(['configure', 'startSession']));
  });

  test('Fire scenario 2 calls debugFire and the check-in opens Check-in', async () => {
    const app = await renderApp('/debug', { phase: PHASES.monitoring });
    fireEvent.press(screen.getByRole('button', { name: 'Fire scenario 2 (fall)' }));
    await waitFor(() => expect(nativeMock().calls).toEqual([{ method: 'debugFire', args: [FALL_SCENARIO] }]));
    await emitPhase(PHASES.whisper);
    expect(app.getPathname()).toBe('/check-in');
  });

  test('Tap Cancel and Stop session reach the module', async () => {
    await renderApp('/debug', { phase: PHASES.monitoring });
    fireEvent.press(screen.getByRole('button', { name: 'Tap Cancel' }));
    fireEvent.press(screen.getByRole('button', { name: 'Stop session' }));
    await waitFor(() => expect(calledMethods()).toEqual(['tapCancel', 'stopSession']));
  });

  test('shows why Stop was refused', async () => {
    jest.spyOn(nativeMock(), 'stopSession').mockResolvedValueOnce(false);
    await renderApp('/debug', { phase: PHASES.monitoring });
    fireEvent.press(screen.getByRole('button', { name: 'Stop session' }));
    expect(await screen.findByText(/stop refused/i)).toBeTruthy();
  });
});
