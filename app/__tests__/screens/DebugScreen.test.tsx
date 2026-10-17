import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import type { Settings } from '../../modules/raveguard-native';
import { firedNotice, SCENARIOS, scenarioLabel } from '../../src/debug/scenarios';
import { appPinStore } from '../../src/pin/PinStoreProvider';
import { DEFAULT_SETTINGS } from '../../src/settings/defaults';
import { SAMPLE_SETTINGS_DRAFT } from '../../src/settings/sampleSettings';
import { fakeFileSystem, seedSavedSettings, SETTINGS_URI } from '../../test-utils/fakeFiles';
import { calledMethods, nativeMock, PHASES } from '../../test-utils/nativeMock';
import { emitMotion, emitPhase, renderApp } from '../../test-utils/renderApp';

const FALL_SCENARIO = 2;
const MONITORING_ONLINE = { phase: PHASES.monitoring };

beforeEach(async () => {
  nativeMock().reset();
  fakeFileSystem().reset();
  await appPinStore().clearPins();
});

function readSavedSettings(): Settings {
  return JSON.parse(fakeFileSystem().files.get(SETTINGS_URI) ?? '{}').settings;
}

describe('Debug panel: readouts', () => {
  test('shows the phase and a live motion readout', async () => {
    await renderApp('/debug', MONITORING_ONLINE);
    expect(screen.getByText('monitoring')).toBeTruthy();
    await emitMotion({ state: 'dancing', pitch: 12.34, roll: -5, accelG: 1.2, at: 0 });
    expect(screen.getByLabelText('Motion: dancing · pitch 12.3° · roll -5.0° · 1.20 g')).toBeTruthy();
    await emitMotion({ state: 'still', pitch: 1, roll: 2, accelG: 1, at: 100 });
    expect(screen.getByLabelText('Motion: still · pitch 1.0° · roll 2.0° · 1.00 g')).toBeTruthy();
  });
});

describe('Debug panel: the seven scenarios (K11 done-when)', () => {
  test.each(SCENARIOS.map((s) => [s.number, scenarioLabel(s)] as const))(
    'button %i fires scenario %i through debugFire',
    async (scenario, label) => {
      await renderApp('/debug', MONITORING_ONLINE);
      fireEvent.press(screen.getByRole('button', { name: label }));
      await waitFor(() => expect(nativeMock().calls).toEqual([{ method: 'debugFire', args: [scenario] }]));
      expect(await screen.findByText(firedNotice(SCENARIOS[scenario - 1]))).toBeTruthy();
    }
  );

  test('from idle the saved settings go through configure() before the scenario fires', async () => {
    seedSavedSettings({ ...DEFAULT_SETTINGS, wearerName: 'Riley' });
    await renderApp('/debug');
    await screen.findByRole('button', { name: 'Start session (demo timings)' });
    fireEvent.press(screen.getByRole('button', { name: 'Scenario 5: Unacknowledged' }));
    await waitFor(() => expect(calledMethods()).toEqual(['configure', 'debugFire']));
    expect(nativeMock().calls[0].args[0]).toMatchObject({ wearerName: 'Riley', demo: true });
    expect(nativeMock().calls[1].args).toEqual([5]);
  });

  test('the check-in a scenario starts opens Check-in', async () => {
    const app = await renderApp('/debug', MONITORING_ONLINE);
    fireEvent.press(screen.getByRole('button', { name: 'Scenario 2: No response' }));
    await waitFor(() => expect(nativeMock().calls).toEqual([{ method: 'debugFire', args: [FALL_SCENARIO] }]));
    await emitPhase(PHASES.whisper);
    expect(app.getPathname()).toBe('/check-in');
  });

  test('shows why a scenario did not fire', async () => {
    jest.spyOn(nativeMock(), 'debugFire').mockRejectedValueOnce(new Error('module not ready'));
    await renderApp('/debug', MONITORING_ONLINE);
    fireEvent.press(screen.getByRole('button', { name: 'Scenario 1: Safe' }));
    expect(await screen.findByText('module not ready')).toBeTruthy();
  });
});

describe('Debug panel: session controls', () => {
  test('Start session sends the saved settings (demo timings by default) and starts', async () => {
    await renderApp('/debug');
    fireEvent.press(screen.getByRole('button', { name: 'Start session (demo timings)' }));
    await waitFor(() => expect(calledMethods()).toEqual(['configure', 'startSession']));
    expect(nativeMock().calls[0].args[0]).toMatchObject({ demo: true });
  });

  test('with real timings saved, Start session says so and sends demo off', async () => {
    seedSavedSettings({ ...DEFAULT_SETTINGS, demo: false });
    await renderApp('/debug');
    fireEvent.press(await screen.findByRole('button', { name: 'Start session (real timings)' }));
    await waitFor(() => expect(calledMethods()).toEqual(['configure', 'startSession']));
    expect(nativeMock().calls[0].args[0]).toMatchObject({ demo: false });
  });

  test('Tap Cancel and Stop session reach the module', async () => {
    await renderApp('/debug', MONITORING_ONLINE);
    fireEvent.press(screen.getByRole('button', { name: 'Tap Cancel' }));
    fireEvent.press(screen.getByRole('button', { name: 'Stop session' }));
    await waitFor(() => expect(calledMethods()).toEqual(['tapCancel', 'stopSession']));
  });

  test('shows why Stop was refused', async () => {
    jest.spyOn(nativeMock(), 'stopSession').mockResolvedValueOnce(false);
    await renderApp('/debug', MONITORING_ONLINE);
    fireEvent.press(screen.getByRole('button', { name: 'Stop session' }));
    expect(await screen.findByText(/stop refused/i)).toBeTruthy();
  });
});

describe('Debug panel: demo/real toggle', () => {
  test('starts from the saved flag', async () => {
    seedSavedSettings({ ...DEFAULT_SETTINGS, demo: false });
    await renderApp('/debug');
    await waitFor(() => expect(screen.getByLabelText('Demo timings').props.value).toBe(false));
  });

  test('turning it off saves real timings and sends them through configure()', async () => {
    await renderApp('/debug');
    fireEvent(screen.getByLabelText('Demo timings'), 'valueChange', false);
    expect(await screen.findByText('Real timings saved')).toBeTruthy();
    expect(calledMethods()).toEqual(['configure']);
    expect(nativeMock().calls[0].args[0]).toMatchObject({ demo: false });
    expect(readSavedSettings().demo).toBe(false);
    expect(screen.getByLabelText('Demo timings').props.value).toBe(false);
    expect(screen.getByRole('button', { name: 'Start session (real timings)' })).toBeTruthy();
  });

  test('turning it back on saves demo timings', async () => {
    seedSavedSettings({ ...DEFAULT_SETTINGS, demo: false });
    await renderApp('/debug');
    await waitFor(() => expect(screen.getByLabelText('Demo timings').props.value).toBe(false));
    fireEvent(screen.getByLabelText('Demo timings'), 'valueChange', true);
    expect(await screen.findByText('Demo timings saved')).toBeTruthy();
    expect(nativeMock().calls[0].args[0]).toMatchObject({ demo: true });
    expect(readSavedSettings().demo).toBe(true);
  });

  test('a failed save says why and keeps the old flag', async () => {
    fakeFileSystem().failNextWrite(new Error('disk full'));
    await renderApp('/debug');
    fireEvent(screen.getByLabelText('Demo timings'), 'valueChange', false);
    expect(await screen.findByText('disk full')).toBeTruthy();
    expect(screen.getByLabelText('Demo timings').props.value).toBe(true);
    expect(calledMethods()).toEqual([]);
  });
});

describe('Debug panel: noise backend picker', () => {
  test('marks the backend from the snapshot', async () => {
    await renderApp('/debug', { noise: { backend: 'shortcuts', connected: true, level: 30 } });
    expect(screen.getByRole('radio', { name: 'Shortcuts' }).props.accessibilityState).toMatchObject({ checked: true });
  });

  test('picking Shortcuts calls setNoiseBackend and follows onNoise', async () => {
    await renderApp('/debug');
    expect(screen.getByRole('radio', { name: 'Off' }).props.accessibilityState).toMatchObject({ checked: true });
    fireEvent.press(screen.getByRole('radio', { name: 'Shortcuts' }));
    await waitFor(() => expect(nativeMock().calls).toEqual([{ method: 'setNoiseBackend', args: ['shortcuts'] }]));
    expect(screen.getByRole('radio', { name: 'Shortcuts' }).props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByText('Backend: shortcuts · connected')).toBeTruthy();
    fireEvent.press(screen.getByRole('radio', { name: 'Off' }));
    await waitFor(() => expect(calledMethods()).toEqual(['setNoiseBackend', 'setNoiseBackend']));
    expect(nativeMock().calls[1].args).toEqual(['off']);
    expect(screen.getByText('Backend: off · not connected')).toBeTruthy();
  });

  test('shows why the backend did not change', async () => {
    jest.spyOn(nativeMock(), 'setNoiseBackend').mockRejectedValueOnce(new Error('no shortcut'));
    await renderApp('/debug');
    fireEvent.press(screen.getByRole('radio', { name: 'Shortcuts' }));
    expect(await screen.findByText('no shortcut')).toBeTruthy();
  });

  test('selecting Background relay reaches native code and waits for confirmation', async () => {
    await renderApp('/debug');
    fireEvent.press(screen.getByRole('radio', { name: 'Background relay' }));
    await waitFor(() => expect(nativeMock().calls).toEqual([{ method: 'setNoiseBackend', args: ['automation'] }]));
    expect(screen.getByRole('radio', { name: 'Background relay' }).props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByText('Backend: automation · not connected')).toBeTruthy();
    fireEvent.press(screen.getByRole('radio', { name: 'Off' }));
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Off' }).props.accessibilityState).toMatchObject({ checked: true }));
  });
});

describe('Debug panel: simulate offline', () => {
  test('flipping it on calls debugSetOffline(true) and shows what Swift reports', async () => {
    await renderApp('/debug', MONITORING_ONLINE);
    const offline = screen.getByLabelText('Simulate offline');
    expect(offline.props.value).toBe(false);
    fireEvent(offline, 'valueChange', true);
    await waitFor(() => expect(nativeMock().calls).toEqual([{ method: 'debugSetOffline', args: [true] }]));
    await waitFor(() => expect(screen.getByLabelText('Simulate offline').props.value).toBe(true));
    fireEvent(screen.getByLabelText('Simulate offline'), 'valueChange', false);
    await waitFor(() => expect(nativeMock().calls[1]).toEqual({ method: 'debugSetOffline', args: [false] }));
    await waitFor(() => expect(screen.getByLabelText('Simulate offline').props.value).toBe(false));
  });

  test('starts from the snapshot, so scenario 4 going offline in Swift shows', async () => {
    await renderApp('/debug', { ...MONITORING_ONLINE, simulatedOffline: true });
    await waitFor(() => expect(screen.getByLabelText('Simulate offline').props.value).toBe(true));
  });

  test('re-reads Swift on every phase change (Stop turns it off in Swift)', async () => {
    await renderApp('/debug', { ...MONITORING_ONLINE, simulatedOffline: true });
    await waitFor(() => expect(screen.getByLabelText('Simulate offline').props.value).toBe(true));
    nativeMock().setSnapshot({ ...(await nativeMock().getSnapshot()), phase: PHASES.idle, simulatedOffline: false });
    await emitPhase(PHASES.idle);
    await waitFor(() => expect(screen.getByLabelText('Simulate offline').props.value).toBe(false));
  });

  test('a failed call says why and shows the state Swift still has', async () => {
    jest.spyOn(nativeMock(), 'debugSetOffline').mockRejectedValueOnce(new Error('session gone'));
    await renderApp('/debug', MONITORING_ONLINE);
    fireEvent(screen.getByLabelText('Simulate offline'), 'valueChange', true);
    expect(await screen.findByText('session gone')).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText('Simulate offline').props.value).toBe(false));
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
      demo: true,
      teammatePhone: '+14165550199',
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

  test('saves the teammate number the demo SOS call rings (K10)', async () => {
    await renderApp('/debug');
    fireEvent.changeText(screen.getByLabelText("Teammate's number"), '+1 416 555 0199');
    fireEvent.press(screen.getByRole('button', { name: "Save teammate's number" }));
    expect(await screen.findByText("Teammate's number saved")).toBeTruthy();
    expect(calledMethods()).toEqual(['configure']);
    expect(nativeMock().calls[0].args[0]).toMatchObject({ teammatePhone: '+14165550199' });
  });

  test('a blank teammate number clears it', async () => {
    seedSavedSettings({ ...DEFAULT_SETTINGS, teammatePhone: '+14165550199' });
    await renderApp('/debug');
    const field = await screen.findByDisplayValue('+14165550199');
    fireEvent.changeText(field, '');
    fireEvent.press(screen.getByRole('button', { name: "Save teammate's number" }));
    expect(await screen.findByText("Teammate's number cleared")).toBeTruthy();
    expect(nativeMock().calls[0].args[0]).toMatchObject({ teammatePhone: null });
  });

  test('a teammate number that is not E.164 is refused and not sent', async () => {
    await renderApp('/debug');
    fireEvent.changeText(screen.getByLabelText("Teammate's number"), '416 555 0199');
    fireEvent.press(screen.getByRole('button', { name: "Save teammate's number" }));
    expect(await screen.findByText(/E\.164/)).toBeTruthy();
    expect(calledMethods()).toEqual([]);
  });

  test('shows why saving failed', async () => {
    fakeFileSystem().failNextWrite(new Error('disk full'));
    await renderApp('/debug');
    fireEvent.press(screen.getByRole('button', { name: 'Save sample settings' }));
    expect(await screen.findByText('disk full')).toBeTruthy();
    expect(calledMethods()).toEqual([]);
  });
});
