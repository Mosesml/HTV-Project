import { StyleSheet } from 'react-native';
import { fireEvent, screen } from 'expo-router/testing-library';

import { MIN_TAP_TARGET } from '../../src/ui/theme';
import { calledMethods, nativeMock, PHASES } from '../../test-utils/nativeMock';
import { emitPhase, renderApp } from '../../test-utils/renderApp';

const SECONDS_LEFT = 8;

beforeEach(() => nativeMock().reset());

describe('Check-in screen', () => {
  test('asks "Are you okay?" with the time left in the stage', async () => {
    const stageEndsAt = Date.now() + SECONDS_LEFT * 1000;
    await renderApp('/check-in', { phase: { ...PHASES.whisper, stageEndsAt } });
    expect(screen.getByText('Are you okay?')).toBeTruthy();
    expect(screen.getByText(`${SECONDS_LEFT} s`)).toBeTruthy();
  });

  test('Cancel calls tapCancel and is at least 60 pt tall', async () => {
    await renderApp('/check-in', { phase: PHASES.whisper });
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(StyleSheet.flatten(cancel.props.style).minHeight).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
    fireEvent.press(cancel);
    expect(calledMethods()).toEqual(['tapCancel']);
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
});
