import { StyleSheet } from 'react-native';
import { act, fireEvent, screen } from 'expo-router/testing-library';

import type { PhaseEvent } from '../../modules/raveguard-native';
import { RING_TICKS } from '../../src/checkIn/countdown';
import { MIN_TAP_TARGET } from '../../src/ui/theme';
import { calledMethods, nativeMock, PHASES } from '../../test-utils/nativeMock';
import { emitPhase, renderApp } from '../../test-utils/renderApp';

const STAGE_MS = 10_000;

function whisperEndingIn(ms: number): PhaseEvent {
  return { ...PHASES.whisper, stageEndsAt: Date.now() + ms };
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

function litTickCount(): number {
  return screen.queryAllByTestId('ring-tick-lit').length;
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
  test('asks "Are you okay?" with the stage and the time left', async () => {
    await renderApp('/check-in', { phase: whisperEndingIn(8_000) });
    expect(screen.getByRole('header', { name: 'Are you okay?' })).toBeTruthy();
    expect(screen.getByText('Step 1 of 3: Whisper')).toBeTruthy();
    expect(screen.getByText('8')).toBeTruthy();
  });

  test('Cancel calls tapCancel and is at least 60 pt tall', async () => {
    await renderApp('/check-in', { phase: PHASES.whisper });
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(StyleSheet.flatten(cancel.props.style).minHeight).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
    fireEvent.press(cancel);
    expect(calledMethods()).toEqual(['tapCancel']);
  });

  test('a Cancel that fails says so and leaves Cancel up to try again', async () => {
    await renderApp('/check-in', { phase: PHASES.loud });
    jest.spyOn(nativeMock(), 'tapCancel').mockRejectedValueOnce(new Error('module busy'));
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent("Cancel didn't go through (module busy). Nod, or tap Cancel again.");
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  test('shows the new stage when the check-in gets louder', async () => {
    await renderApp('/check-in', { phase: whisperEndingIn(STAGE_MS) });
    await emitPhase({ ...PHASES.loud, stageEndsAt: Date.now() + STAGE_MS });
    expect(screen.getByText('Step 2 of 3: Loud')).toBeTruthy();
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
      expect(litTickCount()).toBe(RING_TICKS);
      expect(screen.getByText('10')).toBeTruthy();

      await advance(STAGE_MS / 2);
      expect(litTickCount()).toBe(RING_TICKS / 2);
      expect(screen.getByText('5')).toBeTruthy();

      await advance(STAGE_MS / 2);
      expect(litTickCount()).toBe(0);
      expect(screen.getByText('0')).toBeTruthy();
    });

    test('refills for the next stage', async () => {
      await renderApp('/session', { phase: PHASES.monitoring });
      await emitPhase(whisperEndingIn(STAGE_MS));
      await advance(STAGE_MS);
      await emitPhase({ ...PHASES.loud, stageEndsAt: Date.now() + STAGE_MS });
      expect(litTickCount()).toBe(RING_TICKS);
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
