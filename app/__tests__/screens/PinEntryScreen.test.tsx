import { fireEvent, screen } from 'expo-router/testing-library';

import { nativeMock, PHASES } from '../../test-utils/nativeMock';
import { emitPhase, renderApp } from '../../test-utils/renderApp';

// Placeholder PINs until the PIN gate (K6): 1111 safe, 9999 duress (PRD D2).
const SAFE_PIN = '1111';
const DURESS_PIN = '9999';

beforeEach(() => nativeMock().reset());

function enterPin(pin: string): void {
  fireEvent.changeText(screen.getByLabelText('PIN'), pin);
  fireEvent.press(screen.getByRole('button', { name: 'Submit' }));
}

function pinResults(): unknown[] {
  return nativeMock()
    .calls.filter((call) => call.method === 'pinResult')
    .map((call) => call.args[0]);
}

async function screenAfterPin(pin: string) {
  nativeMock().reset();
  const app = await renderApp('/pin', { phase: PHASES.pinGate });
  enterPin(pin);
  await emitPhase(PHASES.monitoring);
  // The navigator's random screen id is the only thing allowed to differ between two renders.
  const tree = JSON.stringify(app.toJSON()).replace(/"screenId":"[^"]*"/g, '"screenId":"<id>"');
  const pathname = app.getPathname();
  app.unmount();
  return { tree, pathname };
}

describe('PIN entry screen', () => {
  test('a safe PIN shows "Cancelled. Stay safe." and reports safe', async () => {
    await renderApp('/pin', { phase: PHASES.pinGate });
    enterPin(SAFE_PIN);
    expect(await screen.findByText('Cancelled. Stay safe.')).toBeTruthy();
    expect(pinResults()).toEqual(['safe']);
  });

  test('a duress PIN shows the same screen and reports duress', async () => {
    await renderApp('/pin', { phase: PHASES.pinGate });
    enterPin(DURESS_PIN);
    expect(await screen.findByText('Cancelled. Stay safe.')).toBeTruthy();
    expect(pinResults()).toEqual(['duress']);
  });

  test('duress rule: safe and duress leave identical screens and stay on PIN entry', async () => {
    const safe = await screenAfterPin(SAFE_PIN);
    const duress = await screenAfterPin(DURESS_PIN);
    expect(duress.tree).toEqual(safe.tree);
    expect(safe.pathname).toBe('/pin');
    expect(duress.pathname).toBe('/pin');
  });

  test('a wrong PIN says so, reports wrong and lets the wearer try again', async () => {
    await renderApp('/pin', { phase: PHASES.pinGate });
    enterPin('1234');
    expect(await screen.findByText('Wrong PIN. Try again.')).toBeTruthy();
    expect(screen.getByLabelText('PIN').props.value).toBe('');
    expect(pinResults()).toEqual(['wrong']);
  });

  test('Done returns to the session', async () => {
    const app = await renderApp('/pin', { phase: PHASES.pinGate });
    enterPin(SAFE_PIN);
    await emitPhase(PHASES.monitoring);
    fireEvent.press(await screen.findByRole('button', { name: 'Done' }));
    expect(await screen.findByText('Session running')).toBeTruthy();
    expect(app.getPathname()).toBe('/session');
  });

  test('the third wrong PIN escalating opens Alert', async () => {
    const app = await renderApp('/pin', { phase: PHASES.pinGate });
    await emitPhase(PHASES.escalated);
    expect(app.getPathname()).toBe('/alert');
  });
});
