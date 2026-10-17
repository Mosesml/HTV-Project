import { StyleSheet } from 'react-native';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';

import type { HearingEvent, MotionEvent, NoiseEvent } from '../../modules/raveguard-native';
import { DEFAULT_SETTINGS } from '../../src/settings/defaults';
import { CHECK_IN_BUTTON_HEIGHT } from '../../src/ui/theme';
import { fakeFileSystem, seedSavedSettings } from '../../test-utils/fakeFiles';
import { calledMethods, nativeMock, PHASES } from '../../test-utils/nativeMock';
import { emitMotion, emitPhase, renderApp } from '../../test-utils/renderApp';

const MINUTE = 60_000;

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

beforeEach(() => {
  nativeMock().reset();
  fakeFileSystem().reset();
});
afterEach(() => jest.restoreAllMocks());

describe('Active session screen: readings', () => {
  test('shows a dash for room dB, dose, motion and the next check-in while nothing is known', async () => {
    await renderApp('/session', { phase: PHASES.monitoring });
    expect(screen.getByText('Session running')).toBeTruthy();
    expect(screen.getByText('Monitoring')).toBeTruthy();
    expect(screen.getByLabelText('Room: —')).toBeTruthy();
    expect(screen.getByLabelText('Sound dose (estimate): —')).toBeTruthy();
    expect(screen.getByLabelText('Motion: —')).toBeTruthy();
    expect(screen.getByLabelText('Next check-in: —')).toBeTruthy();
  });

  test('shows room dB and dose from onHearing, and dashes again when they go back to null', async () => {
    await renderApp('/session', { phase: PHASES.monitoring });
    await emitHearing({ roomDb: 97.2, dosePercent: 41.6 });
    expect(screen.getByLabelText('Room: 97 dB')).toBeTruthy();
    expect(screen.getByLabelText('Sound dose (estimate): 42%')).toBeTruthy();
    await emitHearing({ roomDb: null, dosePercent: null });
    expect(screen.getByLabelText('Room: —')).toBeTruthy();
    expect(screen.getByLabelText('Sound dose (estimate): —')).toBeTruthy();
  });

  test('takes room dB and dose from the snapshot on mount', async () => {
    await renderApp('/session', { phase: PHASES.monitoring, hearing: { roomDb: 88, dosePercent: 12 } });
    expect(screen.getByLabelText('Room: 88 dB')).toBeTruthy();
    expect(screen.getByLabelText('Sound dose (estimate): 12%')).toBeTruthy();
  });

  test('shows the motion state from onMotion', async () => {
    await renderApp('/session', { phase: PHASES.monitoring });
    await emitMotion(MOTION);
    expect(screen.getByLabelText('Motion: Dancing')).toBeTruthy();
    await emitMotion({ ...MOTION, state: 'still' });
    expect(screen.getByLabelText('Motion: Still')).toBeTruthy();
  });

  test('shows the next check-in from the snapshot', async () => {
    await renderApp('/session', { phase: PHASES.monitoring, nextCheckInAt: Date.now() + 30 * MINUTE });
    expect(screen.getByLabelText('Next check-in: In 30 min')).toBeTruthy();
  });

  test('re-reads the next check-in when the session is back to monitoring after a check-in', async () => {
    const app = await renderApp('/session', { phase: PHASES.monitoring });
    expect(screen.getByLabelText('Next check-in: —')).toBeTruthy();
    await emitPhase(PHASES.whisper);
    expect(app.getPathname()).toBe('/check-in');
    nativeMock().setSnapshot({ ...(await nativeMock().getSnapshot()), nextCheckInAt: Date.now() + 60 * MINUTE });
    await emitPhase(PHASES.monitoring);
    expect(app.getPathname()).toBe('/session');
    expect(screen.getByLabelText('Next check-in: In 60 min')).toBeTruthy();
  });

  test('says so when the readings cannot be loaded', async () => {
    jest.spyOn(nativeMock(), 'getSnapshot').mockRejectedValue(new Error('module gone'));
    await renderApp('/session');
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't read the session (module gone).");
  });
});

describe('Active session screen: protection slider', () => {
  test('shows the protection level from the snapshot, with its AirPods mode', async () => {
    await renderApp('/session', {
      phase: PHASES.monitoring,
      noise: { backend: 'shortcuts', connected: true, level: 40 },
    });
    expect(screen.getByLabelText('Protection level: 40')).toBeTruthy();
    expect(screen.getByText('Adaptive · Through Shortcuts')).toBeTruthy();
    expect(slider().props.value).toBe(40);
  });

  test('shows a dash for the level until the module reports one', async () => {
    jest.spyOn(nativeMock(), 'getSnapshot').mockReturnValue(new Promise(() => {}));
    await renderApp('/session');
    expect(screen.getByLabelText('Protection level: —')).toBeTruthy();
  });

  test('is a 0–100 slider in whole steps', async () => {
    await renderApp('/session', { phase: PHASES.monitoring });
    expect(slider().props).toMatchObject({ minimumValue: 0, maximumValue: 100, step: 1 });
  });

  test('moving the slider calls setProtectionLevel, and the screen shows the level onNoise reports', async () => {
    await renderApp('/session', { phase: PHASES.monitoring });
    await slideTo(75);
    expect(protectionCalls()).toEqual([75]);
    // The mock answers like Swift: onNoise with the new level.
    expect(screen.getByLabelText('Protection level: 75')).toBeTruthy();
    expect(screen.getByText('Noise Cancellation · AirPods control off')).toBeTruthy();
    expect(slider().props.value).toBe(75);
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
  test('Stop is large and stops the module, then returns to Home', async () => {
    seedSavedSettings({ ...DEFAULT_SETTINGS, wearerName: 'Alex' });
    const app = await renderApp('/session', { phase: PHASES.monitoring });
    const stop = screen.getByRole('button', { name: 'Stop session' });
    expect(StyleSheet.flatten(stop.props.style).minHeight).toBe(CHECK_IN_BUTTON_HEIGHT);
    fireEvent.press(stop);
    await waitFor(() => expect(app.getPathname()).toBe('/'));
    expect(calledMethods()).toEqual(['stopSession']);
  });

  test('with nothing saved, Stop lands on Setup step 1', async () => {
    const app = await renderApp('/session', { phase: PHASES.monitoring });
    fireEvent.press(screen.getByRole('button', { name: 'Stop session' }));
    await waitFor(() => expect(app.getPathname()).toBe('/setup/contacts'));
  });

  test('stays put and says why when the module refuses to stop', async () => {
    jest.spyOn(nativeMock(), 'stopSession').mockResolvedValueOnce(false);
    const app = await renderApp('/session', { phase: PHASES.monitoring });
    fireEvent.press(screen.getByRole('button', { name: 'Stop session' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The session is still running: answer the check-in or alert first, then stop.'
    );
    expect(app.getPathname()).toBe('/session');
  });

  test('a Stop that fails says so and stays put', async () => {
    jest.spyOn(nativeMock(), 'stopSession').mockRejectedValueOnce(new Error('module busy'));
    const app = await renderApp('/session', { phase: PHASES.monitoring });
    fireEvent.press(screen.getByRole('button', { name: 'Stop session' }));
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

  test('links to Debug', async () => {
    const app = await renderApp('/session', { phase: PHASES.monitoring });
    fireEvent.press(screen.getByRole('button', { name: 'Debug' }));
    await waitFor(() => expect(app.getPathname()).toBe('/debug'));
  });
});
