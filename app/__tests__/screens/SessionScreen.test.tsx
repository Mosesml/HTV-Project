import { StyleSheet } from 'react-native';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';

import type { HearingEvent, MotionEvent, NoiseEvent } from '../../modules/raveguard-native';
import { DEFAULT_SETTINGS } from '../../src/settings/defaults';
import { HOLD_TO_CONFIRM_MS, TOUCH } from '../../src/ui';
import { fakeFileSystem, seedSavedSettings } from '../../test-utils/fakeFiles';
import { withFakeTimers } from '../../test-utils/fakeTimers';
import { calledMethods, nativeMock, PHASES } from '../../test-utils/nativeMock';
import { emitMotion, emitPhase, renderApp } from '../../test-utils/renderApp';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
/** The mockup's Stop session is 64 pt tall: well over the 44 pt minimum. */
const STOP_HEIGHT = 64;

const MOTION: MotionEvent = { state: 'dancing', pitch: 3, roll: 1, accelG: 1.2, at: 0 };

async function emitHearing(hearing: HearingEvent): Promise<void> {
  await act(async () => {
    nativeMock().emit('onHearing', hearing);
  });
}

async function emitNoise(noise: NoiseEvent): Promise<void> {
  await act(async () => {
    nativeMock().emit('onNoise', noise);
  });
}

async function emitAirPods(connected: boolean): Promise<void> {
  await act(async () => {
    nativeMock().emit('onAirPods', { connected });
  });
}

function slider() {
  return screen.getByLabelText('Protection level');
}

/** What the native slider sends while the wearer drags it to `value`. */
async function slideTo(value: number): Promise<void> {
  await act(async () => {
    fireEvent(slider(), 'valueChange', value);
  });
}

function protectionCalls(): unknown[] {
  return nativeMock()
    .calls.filter((call) => call.method === 'setProtectionLevel')
    .map((call) => call.args[0]);
}

function stopButton() {
  return screen.getByRole('button', { name: 'Stop session' });
}

/** VoiceOver's double tap on Stop: it confirms straight away (a hold can't be done with VoiceOver). */
async function activateStop(): Promise<void> {
  await act(async () => {
    fireEvent(stopButton(), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => jest.advanceTimersByTime(ms));
}

/** Moves the clock on by `ms` at once, then lets the screen's 1 s tick run (cheaper than ticking through an hour). */
async function jump(ms: number): Promise<void> {
  jest.setSystemTime(Date.now() + ms - SECOND);
  await advance(SECOND);
}

beforeEach(() => {
  nativeMock().reset();
  fakeFileSystem().reset();
});
afterEach(() => jest.restoreAllMocks());

describe('Active session screen: status', () => {
  test('has a "Session running" heading for VoiceOver and a "Session live" pill', async () => {
    await renderApp('/session', { phase: PHASES.monitoring });
    expect(screen.getByRole('header', { name: 'Session running' })).toBeTruthy();
    expect(screen.getByText('Session live')).toBeTruthy();
    expect(screen.getByLabelText('Session live, under a minute')).toBeTruthy();
  });

  test('the pill counts the time since the session started, and keeps counting through a check-in', async () => {
    await withFakeTimers(async () => {
      await renderApp('/session', { phase: PHASES.monitoring });
      expect(screen.getByText('0m')).toBeTruthy();
      await jump(HOUR + 42 * MINUTE);
      expect(screen.getByText('1h 42m')).toBeTruthy();
      expect(screen.getByLabelText('Session live, 1 hour 42 minutes')).toBeTruthy();

      await emitPhase(PHASES.whisper);
      await jump(MINUTE);
      await emitPhase(PHASES.monitoring);
      await jump(15 * SECOND);
      expect(screen.getByText('1h 43m')).toBeTruthy();
    });
  });
});

describe('Active session screen: readings', () => {
  test('shows "—" for every hearing value, motion and the next check-in while nothing is known', async () => {
    await renderApp('/session', { phase: PHASES.monitoring });
    expect(screen.getByLabelText('Room: no reading yet')).toBeTruthy();
    expect(screen.getByLabelText('In your ears: no reading yet')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: "Tonight's dose (estimate)" }).props.accessibilityValue.text).toBe(
      'no reading yet'
    );
    expect(screen.getByLabelText('Right now: no reading yet')).toBeTruthy();
    expect(screen.getByLabelText('Next check-in: not scheduled')).toBeTruthy();
    expect(screen.getByText("100% is a full day's safe exposure. Protection floor: —.")).toBeTruthy();
    // Room, in-ear, dose, motion and the next check-in all draw the dash.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(5);
  });

  test('labels the hearing card an estimate, not a medical reading', async () => {
    await renderApp('/session', { phase: PHASES.monitoring });
    expect(screen.getByText('Hearing')).toBeTruthy();
    expect(screen.getByText('Estimates, not a medical reading')).toBeTruthy();
  });

  test('shows room dB and dose from onHearing, and dashes again when they go back to null', async () => {
    await renderApp('/session', { phase: PHASES.monitoring });
    await emitHearing({ roomDb: 97.2, dosePercent: 41.6, mode: 'auto', inEarDb: null, floorLevel: null });
    expect(screen.getByLabelText('Room: 97 dB')).toBeTruthy();
    expect(screen.getByText('42%', { includeHiddenElements: true })).toBeTruthy();
    const dose = screen.getByRole('progressbar', { name: "Tonight's dose (estimate)" });
    expect(dose.props.accessibilityValue).toMatchObject({ now: 42, text: '42 percent of a safe daily amount' });
    await emitHearing({ roomDb: null, dosePercent: null, mode: 'auto', inEarDb: null, floorLevel: null });
    expect(screen.getByLabelText('Room: no reading yet')).toBeTruthy();
    expect(screen.queryByText('42%', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByRole('progressbar', { name: "Tonight's dose (estimate)" }).props.accessibilityValue.text).toBe(
      'no reading yet'
    );
  });

  test('shows the in-ear estimate and the protection floor from onHearing, and dashes again when they go back to null', async () => {
    await renderApp('/session', { phase: PHASES.monitoring });
    await emitHearing({ roomDb: 96, dosePercent: 64, mode: 'auto', inEarDb: 75.8, floorLevel: 45 });
    expect(screen.getByLabelText('In your ears: ~76 dB')).toBeTruthy();
    expect(screen.getByText("100% is a full day's safe exposure. Protection floor has risen to 45.")).toBeTruthy();
    await emitHearing({ roomDb: null, dosePercent: null, mode: 'auto', inEarDb: null, floorLevel: null });
    expect(screen.getByLabelText('In your ears: no reading yet')).toBeTruthy();
    expect(screen.getByText("100% is a full day's safe exposure. Protection floor: —.")).toBeTruthy();
  });

  test('the Automatic switch shows the mode Swift reports and sends setProtectionMode', async () => {
    await renderApp('/session', { phase: PHASES.monitoring });
    const automatic = () => screen.getByRole('switch', { name: 'Automatic protection' });
    expect(automatic().props.accessibilityState).toMatchObject({ checked: true });
    expect(automatic().props.accessibilityHint).toBe("RaveGuard sets protection from the room's loudness.");

    await act(async () => {
      fireEvent.press(automatic());
    });
    expect(calledMethods()).toContain('setProtectionMode');
    // The mock answers like Swift, with onHearing in manual.
    await waitFor(() => expect(automatic().props.accessibilityState).toMatchObject({ checked: false }));
    expect(automatic().props.accessibilityHint).toBe('You set protection with the slider.');
    // Manual has no floor.
    expect(screen.getByText("100% is a full day's safe exposure. Protection floor: —.")).toBeTruthy();
  });

  test('a failed Automatic switch says so and keeps the mode', async () => {
    jest.spyOn(nativeMock(), 'setProtectionMode').mockRejectedValueOnce(new Error('module gone'));
    await renderApp('/session', { phase: PHASES.monitoring });
    await act(async () => {
      fireEvent.press(screen.getByRole('switch', { name: 'Automatic protection' }));
    });
    expect(await screen.findByText("Couldn't switch to manual protection (module gone). Try again.")).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Automatic protection' }).props.accessibilityState).toMatchObject({ checked: true });
  });

  test('takes room dB and dose from the snapshot on mount', async () => {
    await renderApp('/session', { phase: PHASES.monitoring, hearing: { roomDb: 88, dosePercent: 12, mode: 'auto', inEarDb: null, floorLevel: null } });
    expect(screen.getByLabelText('Room: 88 dB')).toBeTruthy();
    expect(screen.getByText('12%', { includeHiddenElements: true })).toBeTruthy();
  });

  test('shows the motion state from onMotion, large', async () => {
    await renderApp('/session', { phase: PHASES.monitoring });
    await emitMotion(MOTION);
    expect(screen.getByLabelText('Right now: Dancing')).toBeTruthy();
    expect(screen.getByText('Dancing')).toBeTruthy();
    await emitMotion({ ...MOTION, state: 'still' });
    expect(screen.getByLabelText('Right now: Still')).toBeTruthy();
  });

  test('counts down to the next check-in in mm:ss, every second', async () => {
    await withFakeTimers(async () => {
      await renderApp('/session', { phase: PHASES.monitoring, nextCheckInAt: Date.now() + 12 * MINUTE + 40 * SECOND });
      expect(screen.getByText('12:40')).toBeTruthy();
      expect(screen.getByLabelText('Next check-in in 12 minutes 40 seconds')).toBeTruthy();
      await advance(SECOND);
      expect(screen.getByText('12:39')).toBeTruthy();
    });
  });

  test('re-reads the next check-in when the session is back to monitoring after a check-in', async () => {
    const app = await renderApp('/session', { phase: PHASES.monitoring });
    expect(screen.getByLabelText('Next check-in: not scheduled')).toBeTruthy();
    await emitPhase(PHASES.whisper);
    expect(app.getPathname()).toBe('/check-in');
    nativeMock().setSnapshot({ ...(await nativeMock().getSnapshot()), nextCheckInAt: Date.now() + 60 * MINUTE });
    await emitPhase(PHASES.monitoring);
    expect(app.getPathname()).toBe('/session');
    expect(screen.getByText('60:00')).toBeTruthy();
  });

  test('says so when the readings cannot be loaded', async () => {
    jest.spyOn(nativeMock(), 'getSnapshot').mockRejectedValue(new Error('module gone'));
    await renderApp('/session');
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't read the session (module gone).");
  });
});

describe('Active session screen: AirPods and Bridge', () => {
  test('AirPods shows "—" until Swift reports, then follows onAirPods', async () => {
    await renderApp('/session', { phase: PHASES.monitoring });
    expect(screen.getByLabelText('AirPods: no reading yet')).toBeTruthy();
    await emitAirPods(true);
    expect(screen.getByLabelText('AirPods: Connected')).toBeTruthy();
    await emitAirPods(false);
    expect(screen.getByLabelText('AirPods: Not connected')).toBeTruthy();
  });

  test('AirPods takes the snapshot on mount', async () => {
    await renderApp('/session', { phase: PHASES.monitoring, airPodsConnected: true });
    expect(screen.getByLabelText('AirPods: Connected')).toBeTruthy();
  });

  test('the Bridge card shows the backend, its AirPods mode and the level', async () => {
    await renderApp('/session', { phase: PHASES.monitoring, noise: { backend: 'bridge', connected: true, level: 62 } });
    expect(screen.getByLabelText('Bridge: Adaptive · 62')).toBeTruthy();
    await emitNoise({ backend: 'bridge', connected: false, level: 62 });
    expect(screen.getByLabelText('Bridge: Not connected')).toBeTruthy();
  });

  test('names Shortcuts when that is the backend, and says when control is off', async () => {
    await renderApp('/session', { phase: PHASES.monitoring, noise: { backend: 'shortcuts', connected: true, level: 40 } });
    expect(screen.getByLabelText('Shortcuts: Adaptive · 40')).toBeTruthy();
    await emitNoise({ backend: 'off', connected: false, level: 40 });
    expect(screen.getByLabelText('Noise control: Off')).toBeTruthy();
  });

  test('the Bridge card shows "—" until the module reports', async () => {
    jest.spyOn(nativeMock(), 'getSnapshot').mockReturnValue(new Promise(() => {}));
    await renderApp('/session');
    expect(screen.getByLabelText('Bridge: no reading yet')).toBeTruthy();
  });
});

describe('Active session screen: protection slider', () => {
  test('shows the protection level from the snapshot, with its AirPods mode', async () => {
    await renderApp('/session', {
      phase: PHASES.monitoring,
      noise: { backend: 'shortcuts', connected: true, level: 40 },
    });
    expect(screen.getByLabelText('Protection level: 40')).toBeTruthy();
    expect(screen.getByLabelText('Shortcuts: Adaptive · 40')).toBeTruthy();
    expect(slider().props.value).toBe(40);
  });

  test('shows a dash for the level until the module reports one', async () => {
    jest.spyOn(nativeMock(), 'getSnapshot').mockReturnValue(new Promise(() => {}));
    await renderApp('/session');
    expect(screen.getByLabelText('Protection level: —')).toBeTruthy();
  });

  test('is a 0–100 slider in whole steps, from "Hear more" to "Filter more"', async () => {
    await renderApp('/session', { phase: PHASES.monitoring });
    expect(slider().props).toMatchObject({ minimumValue: 0, maximumValue: 100, step: 1 });
    expect(screen.getByText('Hear more', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Filter more', { includeHiddenElements: true })).toBeTruthy();
  });

  test('moving the slider calls setProtectionLevel, and the screen shows the level onNoise reports', async () => {
    await renderApp('/session', { phase: PHASES.monitoring });
    await slideTo(75);
    expect(protectionCalls()).toEqual([75]);
    // The mock answers like Swift: onNoise with the new level.
    expect(screen.getByLabelText('Protection level: 75')).toBeTruthy();
    expect(screen.getByLabelText('Noise control: Off')).toBeTruthy();
    expect(slider().props.value).toBe(75);
  });

  test('the mode follows the level once a backend is connected', async () => {
    await renderApp('/session', { phase: PHASES.monitoring, noise: { backend: 'bridge', connected: true, level: 40 } });
    await slideTo(75);
    expect(screen.getByLabelText('Bridge: Noise Cancellation · 75')).toBeTruthy();
  });

  test('sends whole levels only, and nothing when the level has not changed', async () => {
    await renderApp('/session', { phase: PHASES.monitoring, noise: { backend: 'off', connected: false, level: 20 } });
    await slideTo(20.2);
    expect(protectionCalls()).toEqual([]);
    await slideTo(54.6);
    expect(protectionCalls()).toEqual([55]);
  });

  test('a release sends the final level if the drag has not already', async () => {
    await renderApp('/session', { phase: PHASES.monitoring });
    await act(async () => {
      fireEvent(slider(), 'slidingComplete', 33);
    });
    expect(protectionCalls()).toEqual([33]);
  });

  test('follows onNoise when Swift changes the level by itself', async () => {
    await renderApp('/session', { phase: PHASES.monitoring });
    await emitNoise({ backend: 'shortcuts', connected: true, level: 85 });
    expect(screen.getByLabelText('Protection level: 85')).toBeTruthy();
    expect(slider().props.value).toBe(85);
    expect(protectionCalls()).toEqual([]);
  });

  test('keeps working while every hearing value is null', async () => {
    await renderApp('/session', { phase: PHASES.monitoring, hearing: { roomDb: null, dosePercent: null, mode: 'auto', inEarDb: null, floorLevel: null } });
    await slideTo(64);
    expect(protectionCalls()).toEqual([64]);
    expect(screen.getByLabelText('Room: no reading yet')).toBeTruthy();
  });

  test('a fast drag sends one call at a time and ends on the last level', async () => {
    let finishFirst: () => void = () => {};
    const native = nativeMock();
    const original = native.setProtectionLevel;
    jest
      .spyOn(native, 'setProtectionLevel')
      .mockImplementationOnce(
        (level) => new Promise<void>((resolve) => (finishFirst = () => original(level).then(resolve)))
      );
    await renderApp('/session', { phase: PHASES.monitoring });
    await slideTo(10);
    await slideTo(11);
    await slideTo(12);
    expect(native.setProtectionLevel).toHaveBeenCalledTimes(1);
    expect(slider().props.value).toBe(12);
    await act(async () => finishFirst());
    expect((native.setProtectionLevel as jest.Mock).mock.calls.map(([level]) => level)).toEqual([10, 12]);
    expect(screen.getByLabelText('Protection level: 12')).toBeTruthy();
  });

  test('a failed change says so and puts the slider back', async () => {
    await renderApp('/session', { phase: PHASES.monitoring, noise: { backend: 'off', connected: false, level: 30 } });
    jest.spyOn(nativeMock(), 'setProtectionLevel').mockRejectedValueOnce(new Error('module busy'));
    await slideTo(90);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't change protection (module busy). Try again.");
    expect(slider().props.value).toBe(30);
    expect(screen.getByLabelText('Protection level: 30')).toBeTruthy();
  });
});

describe('Active session screen: Stop', () => {
  test('Stop is a large press-and-hold button whose hint says how to use it', async () => {
    await renderApp('/session', { phase: PHASES.monitoring });
    const stop = stopButton();
    expect(StyleSheet.flatten(stop.props.style).minHeight).toBeGreaterThanOrEqual(STOP_HEIGHT);
    expect(STOP_HEIGHT).toBeGreaterThan(TOUCH.min);
    expect(stop.props.accessibilityHint).toBe('Press and hold for 1 second. With VoiceOver, double-tap.');
    expect(screen.getByText('Press and hold')).toBeTruthy();
  });

  test('holding Stop for 1 s stops the module, then returns to Home', async () => {
    await withFakeTimers(async () => {
      seedSavedSettings({ ...DEFAULT_SETTINGS, wearerName: 'Alex' });
      const app = await renderApp('/session', { phase: PHASES.monitoring });
      fireEvent(stopButton(), 'pressIn');
      await advance(HOLD_TO_CONFIRM_MS - 1);
      expect(calledMethods()).toEqual([]);
      await advance(1);
      await waitFor(() => expect(app.getPathname()).toBe('/'));
      expect(calledMethods()).toEqual(['stopSession']);
    });
  });

  test('a tap or a short press does not stop the session', async () => {
    await withFakeTimers(async () => {
      const app = await renderApp('/session', { phase: PHASES.monitoring });
      fireEvent.press(stopButton());
      fireEvent(stopButton(), 'pressIn');
      await advance(HOLD_TO_CONFIRM_MS / 2);
      fireEvent(stopButton(), 'pressOut');
      await advance(2 * HOLD_TO_CONFIRM_MS);
      expect(calledMethods()).toEqual([]);
      expect(app.getPathname()).toBe('/session');
    });
  });

  test("VoiceOver's double tap stops it straight away", async () => {
    seedSavedSettings({ ...DEFAULT_SETTINGS, wearerName: 'Alex' });
    const app = await renderApp('/session', { phase: PHASES.monitoring });
    expect(stopButton().props.accessibilityActions).toEqual([{ name: 'activate', label: 'Stop session' }]);
    await activateStop();
    await waitFor(() => expect(app.getPathname()).toBe('/'));
    expect(calledMethods()).toEqual(['stopSession']);
  });

  test('with nothing saved, Stop lands on Setup step 1', async () => {
    const app = await renderApp('/session', { phase: PHASES.monitoring });
    await activateStop();
    await waitFor(() => expect(app.getPathname()).toBe('/setup/contacts'));
  });

  test('stays put and says why when the module refuses to stop', async () => {
    jest.spyOn(nativeMock(), 'stopSession').mockResolvedValueOnce(false);
    const app = await renderApp('/session', { phase: PHASES.monitoring });
    await activateStop();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The session is still running: answer the check-in or alert first, then stop.'
    );
    expect(app.getPathname()).toBe('/session');
  });

  test('a Stop that fails says so and stays put', async () => {
    jest.spyOn(nativeMock(), 'stopSession').mockRejectedValueOnce(new Error('module busy'));
    const app = await renderApp('/session', { phase: PHASES.monitoring });
    await activateStop();
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't stop the session (module busy). Try again.");
    expect(app.getPathname()).toBe('/session');
  });
});

describe('Active session screen: navigation', () => {
  test('a check-in starting opens the Check-in screen', async () => {
    const app = await renderApp('/session', { phase: PHASES.monitoring });
    await emitPhase(PHASES.whisper);
    expect(app.getPathname()).toBe('/check-in');
    expect(screen.getByText('Are you okay?')).toBeTruthy();
  });

  test('the Debug icon button opens Debug', async () => {
    const app = await renderApp('/session', { phase: PHASES.monitoring });
    fireEvent.press(screen.getByRole('button', { name: 'Debug panel' }));
    await waitFor(() => expect(app.getPathname()).toBe('/debug'));
  });
});
