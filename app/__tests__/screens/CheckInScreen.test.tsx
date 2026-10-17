import { processColor, StyleSheet } from 'react-native';
import { act, fireEvent, screen } from 'expo-router/testing-library';

import type { PhaseEvent } from '../../modules/raveguard-native';
import { STAGE_COLORS, TOUCH } from '../../src/ui';
import { calledMethods, nativeMock, PHASES } from '../../test-utils/nativeMock';
import { emitPhase, renderApp } from '../../test-utils/renderApp';

const STAGE_MS = 10_000;
const HIDDEN = { includeHiddenElements: true };

function whisperEndingIn(ms: number): PhaseEvent {
  return { ...PHASES.whisper, stageEndsAt: Date.now() + ms };
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

/** The share of the stage the ring shows, as VoiceOver reads it (0 to 100). */
function ringPercent(): number {
  return screen.getByRole('progressbar', { name: 'Time left to answer' }).props.accessibilityValue.now;
}

/** How react-native-svg hands a colour to the native view. */
function svgColor(color: string) {
  return { type: 0, payload: processColor(color) };
}

function ringArc() {
  return screen.queryByTestId('countdown-ring-svg-arc', HIDDEN);
}

// The whole file runs on Jest's fake clock (Date.now included), so the ring tests can move
// time on. Switching between fake and real timers mid-file leaves the router's cleanup
// waiting on a timer that never runs.
beforeAll(() => jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] }));
afterAll(() => jest.useRealTimers());

beforeEach(() => nativeMock().reset());

// Let the screen's clock fire before RNTL unmounts it.
afterEach(async () => {
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
});

describe('Check-in screen', () => {
  test('asks "Are you okay?" with the stage, the trigger and the time left', async () => {
    await renderApp('/check-in', { phase: whisperEndingIn(8_000) });
    expect(screen.getByRole('header', { name: 'Are you okay?' })).toBeTruthy();
    expect(screen.getByLabelText('Step 1 of 3: Whisper')).toBeTruthy();
    expect(screen.getByText('Looked like a fall')).toBeTruthy();
    expect(screen.getByText('Whispering in your AirPods')).toBeTruthy();
    expect(screen.getByText('8')).toBeTruthy();
  });

  test('the loud stage shows the trigger reason from onPhase in a card', async () => {
    await renderApp('/check-in', { phase: PHASES.loud });
    const card = screen.getByTestId('check-in-trigger-card');
    expect(card).toHaveTextContent('Looked like a fall', { exact: false });
    expect(card).toHaveTextContent('Spike 3.1 g, head 70° sideways, still 12 s', { exact: false });
    expect(screen.getByText('Louder prompt and vibrating')).toBeTruthy();
  });

  test('"I\'m okay" calls tapCancel and is 96 pt tall', async () => {
    await renderApp('/check-in', { phase: PHASES.whisper });
    const okay = screen.getByRole('button', { name: "I'm okay" });
    expect(StyleSheet.flatten(okay.props.style).minHeight).toBe(TOUCH.checkIn);
    fireEvent.press(okay);
    expect(calledMethods()).toEqual(['tapCancel']);
  });

  test('a cancel that fails says so and leaves "I\'m okay" up to try again', async () => {
    await renderApp('/check-in', { phase: PHASES.loud });
    jest.spyOn(nativeMock(), 'tapCancel').mockRejectedValueOnce(new Error('module busy'));
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: "I'm okay" }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Cancel didn't go through (module busy). Nod twice, or tap I'm okay again."
    );
    expect(screen.getByRole('button', { name: "I'm okay" })).toBeTruthy();
  });

  test('shows the new stage when the check-in gets louder', async () => {
    await renderApp('/check-in', { phase: whisperEndingIn(STAGE_MS) });
    await emitPhase({ ...PHASES.loud, stageEndsAt: Date.now() + STAGE_MS });
    expect(screen.getByLabelText('Step 2 of 3: Louder')).toBeTruthy();
    expect(screen.getByTestId('check-in-trigger-card')).toBeTruthy();
  });

  test('returns to the session once the module is back to monitoring', async () => {
    const app = await renderApp('/session', { phase: PHASES.monitoring });
    await emitPhase(PHASES.whisper);
    expect(app.getPathname()).toBe('/check-in');
    await emitPhase(PHASES.monitoring);
    expect(app.getPathname()).toBe('/session');
  });

  test('moves on to PIN entry at the PIN gate', async () => {
    const app = await renderApp('/check-in', { phase: PHASES.loud });
    await emitPhase(PHASES.pinGate);
    expect(app.getPathname()).toBe('/pin');
  });

  test('opens on its own when the app launches mid-check-in', async () => {
    const app = await renderApp('/', { phase: PHASES.loud });
    expect(app.getPathname()).toBe('/check-in');
  });

  describe('countdown ring', () => {
    test('starts full and drains as the stage runs out', async () => {
      await renderApp('/session', { phase: PHASES.monitoring });
      await emitPhase(whisperEndingIn(STAGE_MS));
      expect(ringPercent()).toBe(100);
      expect(ringArc()?.props.stroke).toEqual(svgColor(STAGE_COLORS.whisper));
      expect(screen.getByText('10')).toBeTruthy();

      await advance(STAGE_MS / 2);
      expect(ringPercent()).toBe(50);
      expect(screen.getByText('5')).toBeTruthy();

      await advance(STAGE_MS / 2);
      expect(ringPercent()).toBe(0);
      expect(ringArc()).toBeNull();
      expect(screen.getByText('0')).toBeTruthy();
    });

    test('refills, amber and the same size, for the next stage', async () => {
      await renderApp('/session', { phase: PHASES.monitoring });
      await emitPhase(whisperEndingIn(STAGE_MS));
      const whisperSize = StyleSheet.flatten(screen.getByTestId('countdown-ring').props.style);
      await advance(STAGE_MS);
      await emitPhase({ ...PHASES.loud, stageEndsAt: Date.now() + STAGE_MS });
      expect(ringPercent()).toBe(100);
      expect(ringArc()?.props.stroke).toEqual(svgColor(STAGE_COLORS.loud));
      expect(StyleSheet.flatten(screen.getByTestId('countdown-ring').props.style)).toEqual(whisperSize);
    });

    test('tells VoiceOver the time left', async () => {
      await renderApp('/session', { phase: PHASES.monitoring });
      await emitPhase(whisperEndingIn(STAGE_MS));
      await advance(2_000);
      const ring = screen.getByRole('progressbar', { name: 'Time left to answer' });
      expect(ring.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 80, text: '8 seconds left' });
    });
  });
});
