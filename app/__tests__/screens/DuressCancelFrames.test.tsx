import { act, fireEvent, screen } from 'expo-router/testing-library';

import { CANCEL_HAPTIC, CANCELLING_MS } from '../../src/pin/cancelSequence';
import { appPinStore } from '../../src/pin/PinStoreProvider';
import { fakeHaptics } from '../../test-utils/fakeHapticsControls';
import { fakeSecureStore } from '../../test-utils/fakeSecureStoreControls';
import { nativeMock, PHASES } from '../../test-utils/nativeMock';
import { renderApp } from '../../test-utils/renderApp';

// K9's done-when, in Jest: the safe and the duress PIN recorded frame by frame, at 60 fps,
// from the tap on Submit to well after "Cancelled. Stay safe.", must match exactly. Real
// side-by-side screen recordings on the phone are in docs/overnight/K9.md.

const SAFE_PIN = '2468';
const DURESS_PIN = '1357';
const FRAME_MS = 16;
/** Long enough to see "Cancelled. Stay safe." settle. */
const RECORD_MS = CANCELLING_MS + 400;

type Frame = { at: number; tree: string };

// The whole file runs on Jest's fake clock, as in CheckInScreen.test.tsx.
beforeAll(() => jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] }));
afterAll(() => jest.useRealTimers());

beforeEach(async () => {
  nativeMock().reset();
  fakeHaptics().reset();
  fakeSecureStore().reset();
  await appPinStore().setPins({ safePin: SAFE_PIN, duressPin: DURESS_PIN });
});

afterEach(async () => {
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
  jest.restoreAllMocks();
});

/** Lets the PIN check (Keychain read and hashing, all promises) finish without moving the clock. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 50; i += 1) await Promise.resolve();
  });
}

function snapshot(json: unknown): string {
  // The navigator's random screen id is the only thing allowed to differ between two renders.
  return JSON.stringify(json).replace(/"screenId":"[^"]*"/g, '"screenId":"<id>"');
}

function pinResults(): unknown[] {
  return nativeMock()
    .calls.filter((call) => call.method === 'pinResult')
    .map((call) => call.args[0]);
}

/** Enters `pin` at the PIN gate and records what is on screen every frame. */
async function record(pin: string, beforeSubmit: () => void = () => {}) {
  nativeMock().reset();
  fakeHaptics().reset();
  const app = await renderApp('/pin', { phase: PHASES.pinGate });
  beforeSubmit();
  fireEvent.changeText(screen.getByLabelText('PIN'), pin);
  fireEvent.press(screen.getByRole('button', { name: 'Submit' }));
  // The frame while the PIN is being checked.
  const checking = snapshot(app.toJSON());
  await settle();
  const sentAtStart = pinResults();
  const hapticsAtStart = fakeHaptics().calls;
  // Swift answers both PINs with `monitoring` (the duress rule).
  await act(async () => {
    nativeMock().emit('onPhase', PHASES.monitoring);
  });
  const frames: Frame[] = [];
  for (let at = 0; at <= RECORD_MS; at += FRAME_MS) {
    frames.push({ at, tree: snapshot(app.toJSON()) });
    await act(async () => {
      jest.advanceTimersByTime(FRAME_MS);
    });
  }
  const result = {
    checking,
    frames,
    hapticsAtStart,
    haptics: fakeHaptics().calls,
    sentAtStart,
    pathname: app.getPathname(),
  };
  app.unmount();
  return result;
}

function firstFrameShowing(frames: Frame[], text: string): number {
  return frames.find((frame) => frame.tree.includes(`"${text}"`))?.at ?? -1;
}

describe('duress-identical cancel (K9, PRD D7, UI-4)', () => {
  test('safe and duress match frame for frame, from Submit to "Cancelled. Stay safe."', async () => {
    const safe = await record(SAFE_PIN);
    const duress = await record(DURESS_PIN);

    expect(duress.checking).toEqual(safe.checking);
    expect(duress.frames).toHaveLength(safe.frames.length);
    duress.frames.forEach((frame, index) => {
      expect({ at: frame.at, tree: frame.tree }).toEqual(safe.frames[index]);
    });
    expect(duress.pathname).toBe(safe.pathname);
    expect(safe.pathname).toBe('/pin');
  });

  test('both show "Cancelling…" straight away and "Cancelled. Stay safe." after 600 ms', async () => {
    for (const pin of [SAFE_PIN, DURESS_PIN]) {
      const { frames } = await record(pin);
      expect(firstFrameShowing(frames, 'Cancelling…')).toBe(0);
      const cancelledAt = firstFrameShowing(frames, 'Cancelled. Stay safe.');
      // The first 60 fps frame at or after 600 ms.
      expect(cancelledAt).toBe(Math.ceil(CANCELLING_MS / FRAME_MS) * FRAME_MS);
      expect(frames.filter((frame) => frame.at < CANCELLING_MS).every((frame) => frame.tree.includes('"Cancelling…"'))).toBe(true);
    }
  });

  test('both play the same single haptic, as "Cancelling…" appears', async () => {
    const safe = await record(SAFE_PIN);
    const duress = await record(DURESS_PIN);
    const expected = [{ method: 'notificationAsync', type: CANCEL_HAPTIC }];
    expect(safe.hapticsAtStart).toEqual(expected);
    expect(safe.haptics).toEqual(expected);
    expect(duress.hapticsAtStart).toEqual(expected);
    expect(duress.haptics).toEqual(expected);
  });

  test('pinResult goes out as "Cancelling…" appears; the kind is the only difference, and it is off screen', async () => {
    const safe = await record(SAFE_PIN);
    const duress = await record(DURESS_PIN);
    expect(safe.sentAtStart).toEqual(['safe']);
    expect(duress.sentAtStart).toEqual(['duress']);
  });

  test('a pinResult that never answers gives the same frames', async () => {
    const answered = await record(DURESS_PIN);
    jest.spyOn(nativeMock(), 'pinResult').mockReturnValue(new Promise<void>(() => {}));
    const hanging = await record(DURESS_PIN);
    expect(hanging.frames).toEqual(answered.frames);
  });

  test('a pinResult that fails gives the same frames', async () => {
    const answered = await record(SAFE_PIN);
    jest.spyOn(nativeMock(), 'pinResult').mockRejectedValue(new Error('module gone'));
    const failed = await record(SAFE_PIN);
    expect(failed.frames).toEqual(answered.frames);
  });

  test('a phone without haptics gives the same frames', async () => {
    const withHaptics = await record(DURESS_PIN);
    const failing = await record(DURESS_PIN, () => fakeHaptics().failNext(new Error('haptics unavailable')));
    expect(failing.frames).toEqual(withHaptics.frames);
  });

  test('a wrong PIN shows a neutral retry, no "Cancelling…" and no haptic', async () => {
    const wrong = await record('0000');
    expect(firstFrameShowing(wrong.frames, 'Cancelling…')).toBe(-1);
    expect(firstFrameShowing(wrong.frames, 'Wrong PIN. Try again.')).toBe(0);
    expect(wrong.haptics).toEqual([]);
    expect(wrong.sentAtStart).toEqual(['wrong']);
  });
});
