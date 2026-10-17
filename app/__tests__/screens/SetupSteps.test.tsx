import { fireEvent, screen } from 'expo-router/testing-library';

import { fakeFileSystem } from '../../test-utils/fakeFiles';
import { nativeMock } from '../../test-utils/nativeMock';
import { renderApp } from '../../test-utils/renderApp';

// Smoke tests for the four setup steps (placeholders from the UI foundation; the setup-home
// group fills them in): each route renders its step, and Next / Back walk the flow.

beforeEach(() => {
  nativeMock().reset();
  fakeFileSystem().reset();
});

describe('setup steps', () => {
  test.each([
    ['/setup/contacts', 'Step 1 of 4', 'Who gets the alert?'],
    ['/setup/permissions', 'Step 2 of 4', 'What each person sees'],
    ['/setup/session', 'Step 3 of 4', 'Your night'],
    ['/setup/pins', 'Step 4 of 4', 'Two PINs'],
  ])('%s shows %s: %s', async (url, step, title) => {
    const app = await renderApp(url);
    expect(app.getPathname()).toBe(url);
    expect(screen.getByText(step)).toBeTruthy();
    expect(screen.getByRole('header', { name: title })).toBeTruthy();
  });

  test('Next walks the four steps and Back returns', async () => {
    const app = await renderApp('/setup/contacts');
    fireEvent.press(screen.getByRole('button', { name: 'Next: who sees what' }));
    expect(await screen.findByText('Step 2 of 4')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Next: your night' }));
    expect(await screen.findByText('Step 3 of 4')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Next: your PINs' }));
    expect(await screen.findByText('Step 4 of 4')).toBeTruthy();
    expect(app.getPathname()).toBe('/setup/pins');
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Step 3 of 4')).toBeTruthy();
    expect(app.getPathname()).toBe('/setup/session');
  });

  test('step 1 says RaveGuard never dials emergency services', async () => {
    await renderApp('/setup/contacts');
    expect(screen.getByText(/We never dial emergency services on our own\./)).toBeTruthy();
  });

  test('step 1 offers the one-page setup until the steps are built', async () => {
    const app = await renderApp('/setup/contacts');
    fireEvent.press(screen.getByRole('button', { name: 'One-page setup' }));
    expect(await screen.findByText('Set up RaveGuard')).toBeTruthy();
    expect(app.getPathname()).toBe('/setup');
  });
});
