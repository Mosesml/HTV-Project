import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { appPinStore } from '../../src/pin/PinStoreProvider';
import { SAMPLE_SETTINGS_DRAFT } from '../../src/settings/sampleSettings';
import { fakeFileSystem, SETTINGS_URI } from '../../test-utils/fakeFiles';
import { calledMethods, nativeMock, PHASES } from '../../test-utils/nativeMock';
import { emitMotion, emitPhase, renderApp } from '../../test-utils/renderApp';

const FALL_SCENARIO = 2;

beforeEach(async () => {
  nativeMock().reset();
  fakeFileSystem().reset();
  await appPinStore().clearPins();
});

describe('Debug screen (the K2 smoke buttons, for K11 to grow)', () => {
  test('shows the phase and a live motion readout', async () => {
    await renderApp('/debug', { phase: PHASES.monitoring });
    expect(screen.getByText('monitoring')).toBeTruthy();
    await emitMotion({ state: 'dancing', pitch: 12.34, roll: -5, accelG: 1.2, at: 0 });
    expect(screen.getByText('dancing · pitch 12.3° · roll -5.0° · 1.20 g')).toBeTruthy();
  });

  test('Start session (demo) configures the module with demo timings and starts it', async () => {
    await renderApp('/debug');
    fireEvent.press(screen.getByRole('button', { name: 'Start session (demo)' }));
    await waitFor(() => expect(calledMethods()).toEqual(['configure', 'startSession']));
    expect(nativeMock().calls[0].args[0]).toMatchObject({ demo: true });
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

describe('Debug screen: settings storage (K4)', () => {
  test('Save sample settings saves them and sends them through configure()', async () => {
    await renderApp('/debug');
    fireEvent.press(screen.getByRole('button', { name: 'Save sample settings' }));
    expect(await screen.findByText('Sample settings saved')).toBeTruthy();
    expect(fakeFileSystem().files.has(SETTINGS_URI)).toBe(true);
    expect(calledMethods()).toEqual(['configure']);
    expect(nativeMock().calls[0].args[0]).toMatchObject({
      wearerName: SAMPLE_SETTINGS_DRAFT.wearerName,
      intervalMin: SAMPLE_SETTINGS_DRAFT.intervalMin,
    });
  });

  test('the sample settings survive a relaunch', async () => {
    const first = await renderApp('/debug');
    fireEvent.press(screen.getByRole('button', { name: 'Save sample settings' }));
    expect(await screen.findByText('Sample settings saved')).toBeTruthy();
    const sent = nativeMock().calls[0].args[0];
    first.unmount();
    nativeMock().reset();

    await renderApp('/');
    expect(screen.getByText(`Wearer: ${SAMPLE_SETTINGS_DRAFT.wearerName}`)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Start session' }));
    await waitFor(() => expect(calledMethods()).toEqual(['configure', 'startSession']));
    expect(nativeMock().calls[0].args[0]).toEqual(sent);
  });

  test('Reset settings deletes the saved file and goes back to the defaults', async () => {
    await renderApp('/debug');
    fireEvent.press(screen.getByRole('button', { name: 'Save sample settings' }));
    expect(await screen.findByText('Sample settings saved')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Reset settings' }));
    expect(await screen.findByText('Settings reset to the defaults')).toBeTruthy();
    expect(fakeFileSystem().files.size).toBe(0);
  });

  test('Reset settings also forgets the PINs, so setup starts from scratch', async () => {
    await appPinStore().setPins({ safePin: '2468', duressPin: '1357' });
    await renderApp('/debug');
    fireEvent.press(screen.getByRole('button', { name: 'Reset settings' }));
    expect(await screen.findByText('Settings reset to the defaults')).toBeTruthy();
    expect(await appPinStore().hasPins()).toBe(false);
  });

  test('shows why saving failed', async () => {
    fakeFileSystem().failNextWrite(new Error('disk full'));
    await renderApp('/debug');
    fireEvent.press(screen.getByRole('button', { name: 'Save sample settings' }));
    expect(await screen.findByText('disk full')).toBeTruthy();
    expect(calledMethods()).toEqual([]);
  });
});
