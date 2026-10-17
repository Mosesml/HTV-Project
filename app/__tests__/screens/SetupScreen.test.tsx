import { fireEvent, screen } from 'expo-router/testing-library';

import { PLACEHOLDER_SETTINGS } from '../../src/session/placeholderSettings';
import { calledMethods, nativeMock, PHASES } from '../../test-utils/nativeMock';
import { renderApp } from '../../test-utils/renderApp';

beforeEach(() => nativeMock().reset());

describe('Setup screen', () => {
  test('is the screen the app opens on', async () => {
    const app = await renderApp('/');
    expect(app.getPathname()).toBe('/');
    expect(screen.getByText('Set up RaveGuard')).toBeTruthy();
  });

  test('Start session configures the module, starts it and opens the session screen', async () => {
    const app = await renderApp('/');
    fireEvent.press(screen.getByRole('button', { name: 'Start session' }));
    expect(await screen.findByText('Session running')).toBeTruthy();
    expect(calledMethods()).toEqual(['configure', 'startSession']);
    expect(nativeMock().calls[0].args).toEqual([PLACEHOLDER_SETTINGS]);
    expect(app.getPathname()).toBe('/session');
  });

  test('shows the error when the module refuses to start', async () => {
    jest.spyOn(nativeMock(), 'startSession').mockRejectedValueOnce(new Error('no AirPods'));
    const app = await renderApp('/');
    fireEvent.press(screen.getByRole('button', { name: 'Start session' }));
    expect(await screen.findByText('no AirPods')).toBeTruthy();
    expect(app.getPathname()).toBe('/');
  });

  test('opens the session screen at launch when a session is already running', async () => {
    const app = await renderApp('/', { phase: PHASES.monitoring });
    expect(app.getPathname()).toBe('/session');
  });

  test('links to Debug', async () => {
    const app = await renderApp('/');
    fireEvent.press(screen.getByRole('button', { name: 'Debug' }));
    expect(await screen.findByText('onMotion')).toBeTruthy();
    expect(app.getPathname()).toBe('/debug');
  });
});
