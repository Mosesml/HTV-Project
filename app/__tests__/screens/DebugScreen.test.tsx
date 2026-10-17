import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { router } from 'expo-router';
import { AccessibilityInfo } from 'react-native';

import type { Settings } from '../../modules/raveguard-native';
import { firedNotice, SCENARIOS, scenarioLabel } from '../../src/debug/scenarios';
import { appPinStore } from '../../src/pin/PinStoreProvider';
import { DEFAULT_SETTINGS } from '../../src/settings/defaults';
import { buildSampleSettings, SAMPLE_SETTINGS_DRAFT } from '../../src/settings/sampleSettings';
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

const DEMO = /^Demo timings/;
const REAL = /^Real timings/;

function isChecked(role: 'radio' | 'switch', name: RegExp | string): boolean {
  return screen.getByRole(role, { name }).props.accessibilityState.checked;
}

const isOfflineOn = () => isChecked('switch', 'Simulate offline');

/** Settings whose first two recipients (by texting order) are Maya and Theo, as in the mockup. */
function mockupSettings(): Settings {
  const sample = buildSampleSettings();
  const names = ['Maya', 'Theo', 'Main stage medical'];
  return { ...sample, recipients: sample.recipients.map((r, i) => ({ ...r, name: names[i] })) };
}

describe('Debug panel: header and Back', () => {
  test('draws the mockup header: Back, the Debug heading and the Simulated tag', async () => {
    await renderApp('/debug', MONITORING_ONLINE);
    expect(screen.getByRole('header', { name: 'Debug' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(screen.getByLabelText(/^Simulated/)).toBeTruthy();
    expect(screen.getByText('Simulated')).toBeTruthy();
  });

  test('Back returns to Home when Debug was opened from Home', async () => {
    seedSavedSettings({ ...DEFAULT_SETTINGS, wearerName: 'Riley' });
    const app = await renderApp('/');
    await act(async () => router.push('/debug'));
    expect(app.getPathname()).toBe('/debug');
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(app.getPathname()).toBe('/'));
    expect(screen.getByText('Tonight, Riley')).toBeTruthy();
  });

  test('Back returns to Active session when Debug was opened from it', async () => {
    seedSavedSettings(DEFAULT_SETTINGS);
    const app = await renderApp('/session', MONITORING_ONLINE);
    await act(async () => router.push('/debug'));
    expect(app.getPathname()).toBe('/debug');
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(app.getPathname()).toBe('/session'));
  });

  test('Back with nothing behind it (Debug opened at launch) goes Home', async () => {
    seedSavedSettings(DEFAULT_SETTINGS);
    const app = await renderApp('/debug');
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(app.getPathname()).toBe('/'));
  });
});

describe('Debug panel: notices', () => {
  test('a notice is also announced to VoiceOver', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await renderApp('/debug', MONITORING_ONLINE);
    fireEvent.press(screen.getByRole('button', { name: 'Scenario 1: Safe' }));
    const notice = firedNotice(SCENARIOS[0]);
    expect(await screen.findByText(notice)).toBeTruthy();
    expect(announce).toHaveBeenCalledWith(notice);
  });
});

describe('Debug panel: readouts', () => {
  test('shows the phase and a live motion readout', async () => {
    await renderApp('/debug', MONITORING_ONLINE);
    expect(screen.getByText('monitoring')).toBeTruthy();
    expect(screen.getByText('Live head motion')).toBeTruthy();
    await emitMotion({ state: 'dancing', pitch: 12.34, roll: -5, accelG: 1.2, at: 0 });
    expect(screen.getByLabelText('Motion: dancing · pitch 12.3° · roll -5.0° · 1.20 g')).toBeTruthy();
    expect(screen.getByText('12.3°')).toBeTruthy();
    expect(screen.getByText('10 Hz')).toBeTruthy();
    await emitMotion({ state: 'still', pitch: 1, roll: 2, accelG: 1, at: 100 });
    expect(screen.getByLabelText('Motion: still · pitch 1.0° · roll 2.0° · 1.00 g')).toBeTruthy();
  });
});

describe('Debug panel: the seven scenarios (K11 done-when)', () => {
  test.each(SCENARIOS.map((s) => [s.number, scenarioLabel(s)] as const))(
    'row %i (%s) fires its scenario through debugFire',
    async (scenario, label) => {
      await renderApp('/debug', MONITORING_ONLINE);
      fireEvent.press(screen.getByRole('button', { name: label }));
      await waitFor(() => expect(nativeMock().calls).toEqual([{ method: 'debugFire', args: [scenario] }]));
      expect(await screen.findByText(firedNotice(SCENARIOS[scenario - 1]))).toBeTruthy();
    }
  );

  test('the rows carry the mockup titles, with sublines naming the saved recipients', async () => {
    seedSavedSettings(mockupSettings());
    await renderApp('/debug');
    expect(await screen.findByText('Maya never answers, Theo is texted')).toBeTruthy();
    expect(screen.getByText('Theo gets no location, short brief')).toBeTruthy();
    expect(screen.getByText('Fire a scenario')).toBeTruthy();
    SCENARIOS.forEach((s) => expect(screen.getByText(s.name)).toBeTruthy());
  });

  test('while a check-in is open the rows are off and say why', async () => {
    // The open check-in takes the wearer to Check-in; Debug opened again on top of it.
    const app = await renderApp('/debug', { phase: PHASES.whisper });
    expect(app.getPathname()).toBe('/check-in');
    await act(async () => router.push('/debug'));
    expect(screen.getByRole('button', { name: 'Scenario 1: Safe' }).props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText(/A check-in or alert is open/)).toBeTruthy();
  });

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

describe('Debug panel: demo/real timings', () => {
  test('starts from the saved flag', async () => {
    seedSavedSettings({ ...DEFAULT_SETTINGS, demo: false });
    await renderApp('/debug');
    await waitFor(() => expect(isChecked('radio', REAL)).toBe(true));
    expect(isChecked('radio', DEMO)).toBe(false);
  });

  test('picking Real saves real timings and sends them through configure()', async () => {
    await renderApp('/debug');
    expect(screen.getByText('Demo · 95 s to SOS')).toBeTruthy();
    fireEvent.press(screen.getByRole('radio', { name: REAL }));
    expect(await screen.findByText('Real timings saved')).toBeTruthy();
    expect(calledMethods()).toEqual(['configure']);
    expect(nativeMock().calls[0].args[0]).toMatchObject({ demo: false });
    expect(readSavedSettings().demo).toBe(false);
    expect(isChecked('radio', REAL)).toBe(true);
    expect(screen.getByRole('button', { name: 'Start session (real timings)' })).toBeTruthy();
  });

  test('picking Demo again saves demo timings', async () => {
    seedSavedSettings({ ...DEFAULT_SETTINGS, demo: false });
    await renderApp('/debug');
    await waitFor(() => expect(isChecked('radio', REAL)).toBe(true));
    fireEvent.press(screen.getByRole('radio', { name: DEMO }));
    expect(await screen.findByText('Demo timings saved')).toBeTruthy();
    expect(nativeMock().calls[0].args[0]).toMatchObject({ demo: true });
    expect(readSavedSettings().demo).toBe(true);
  });

  test('a failed save says why and keeps the old flag', async () => {
    fakeFileSystem().failNextWrite(new Error('disk full'));
    await renderApp('/debug');
    fireEvent.press(screen.getByRole('radio', { name: REAL }));
    expect(await screen.findByText('disk full')).toBeTruthy();
    expect(isChecked('radio', DEMO)).toBe(true);
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

  test('the cut Linux bridge is not offered', async () => {
    await renderApp('/debug');
    expect(screen.queryByRole('radio', { name: 'Bridge' })).toBeNull();
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
    expect(isOfflineOn()).toBe(false);
    fireEvent.press(screen.getByRole('switch', { name: 'Simulate offline' }));
    await waitFor(() => expect(nativeMock().calls).toEqual([{ method: 'debugSetOffline', args: [true] }]));
    await waitFor(() => expect(isOfflineOn()).toBe(true));
    fireEvent.press(screen.getByRole('switch', { name: 'Simulate offline' }));
    await waitFor(() => expect(nativeMock().calls[1]).toEqual({ method: 'debugSetOffline', args: [false] }));
    await waitFor(() => expect(isOfflineOn()).toBe(false));
  });

  test('starts from the snapshot, so scenario 4 going offline in Swift shows', async () => {
    await renderApp('/debug', { ...MONITORING_ONLINE, simulatedOffline: true });
    await waitFor(() => expect(isOfflineOn()).toBe(true));
  });

  test('re-reads Swift on every phase change (Stop turns it off in Swift)', async () => {
    await renderApp('/debug', { ...MONITORING_ONLINE, simulatedOffline: true });
    await waitFor(() => expect(isOfflineOn()).toBe(true));
    nativeMock().setSnapshot({ ...(await nativeMock().getSnapshot()), phase: PHASES.idle, simulatedOffline: false });
    await emitPhase(PHASES.idle);
    await waitFor(() => expect(isOfflineOn()).toBe(false));
  });

  test('a failed call says why and shows the state Swift still has', async () => {
    jest.spyOn(nativeMock(), 'debugSetOffline').mockRejectedValueOnce(new Error('session gone'));
    await renderApp('/debug', MONITORING_ONLINE);
    fireEvent.press(screen.getByRole('switch', { name: 'Simulate offline' }));
    expect(await screen.findByText('session gone')).toBeTruthy();
    await waitFor(() => expect(isOfflineOn()).toBe(false));
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
    expect(screen.getByText(`Tonight, ${SAMPLE_SETTINGS_DRAFT.wearerName}`)).toBeTruthy();
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
