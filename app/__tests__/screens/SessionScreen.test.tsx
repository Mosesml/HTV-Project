import { fireEvent, screen } from 'expo-router/testing-library';

import { calledMethods, nativeMock, PHASES } from '../../test-utils/nativeMock';
import { emitPhase, renderApp } from '../../test-utils/renderApp';

beforeEach(() => nativeMock().reset());

describe('Active session screen', () => {
  test('shows the session phase from the module', async () => {
    await renderApp('/session', { phase: PHASES.monitoring });
    expect(screen.getByText('Session running')).toBeTruthy();
    expect(screen.getByText('Monitoring')).toBeTruthy();
  });

  test('Stop session stops the module and returns to Setup', async () => {
    const app = await renderApp('/session', { phase: PHASES.monitoring });
    fireEvent.press(screen.getByRole('button', { name: 'Stop session' }));
    expect(await screen.findByText('Set up RaveGuard')).toBeTruthy();
    expect(calledMethods()).toEqual(['stopSession']);
    expect(app.getPathname()).toBe('/');
  });

  test('stays put and says why when the module refuses to stop', async () => {
    jest.spyOn(nativeMock(), 'stopSession').mockResolvedValueOnce(false);
    const app = await renderApp('/session', { phase: PHASES.monitoring });
    fireEvent.press(screen.getByRole('button', { name: 'Stop session' }));
    expect(await screen.findByText(/answer the check-in/i)).toBeTruthy();
    expect(app.getPathname()).toBe('/session');
  });

  test('a check-in starting opens the Check-in screen', async () => {
    const app = await renderApp('/session', { phase: PHASES.monitoring });
    await emitPhase(PHASES.whisper);
    expect(app.getPathname()).toBe('/check-in');
    expect(screen.getByText('Are you okay?')).toBeTruthy();
  });

  test('links to Debug', async () => {
    const app = await renderApp('/session', { phase: PHASES.monitoring });
    fireEvent.press(screen.getByRole('button', { name: 'Debug' }));
    expect(await screen.findByText('onMotion')).toBeTruthy();
    expect(app.getPathname()).toBe('/debug');
  });
});
