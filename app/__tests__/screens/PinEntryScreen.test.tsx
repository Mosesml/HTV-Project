import { fireEvent, screen } from 'expo-router/testing-library';

import { appPinStore } from '../../src/pin/PinStoreProvider';
import { fakeSecureStore } from '../../test-utils/fakeSecureStoreControls';
import { nativeMock, PHASES } from '../../test-utils/nativeMock';
import { emitPhase, renderApp } from '../../test-utils/renderApp';

// The PINs the wearer set in Setup, kept as salted hashes in the (fake) Keychain (K6).
const SAFE_PIN = '2468';
const DURESS_PIN = '1357';

beforeEach(async () => {
  nativeMock().reset();
  fakeSecureStore().reset();
  await appPinStore().setPins({ safePin: SAFE_PIN, duressPin: DURESS_PIN });
});

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
  await screen.findByText('Cancelled. Stay safe.');
  await emitPhase(PHASES.monitoring);
  // The navigator's random screen id is the only thing allowed to differ between two renders.
  const tree = JSON.stringify(app.toJSON()).replace(/"screenId":"[^"]*"/g, '"screenId":"<id>"');
  const pathname = app.getPathname();
  app.unmount();
  return { tree, pathname };
}

describe('PIN entry screen', () => {
  test('the safe PIN from Setup shows "Cancelled. Stay safe." and reports safe', async () => {
    await renderApp('/pin', { phase: PHASES.pinGate });
    enterPin(SAFE_PIN);
    expect(await screen.findByText('Cancelled. Stay safe.')).toBeTruthy();
    expect(pinResults()).toEqual(['safe']);
  });

  test('the duress PIN from Setup shows the same screen and reports duress', async () => {
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

  test('the old placeholder PINs 1111 and 9999 are now wrong', async () => {
    await renderApp('/pin', { phase: PHASES.pinGate });
    enterPin('1111');
    expect(await screen.findByText('Wrong PIN. Try again.')).toBeTruthy();
    enterPin('9999');
    await screen.findByText('Wrong PIN. Try again.');
    expect(pinResults()).toEqual(['wrong', 'wrong']);
    expect(screen.queryByText('Cancelled. Stay safe.')).toBeNull();
  });

  test('every wrong PIN is reported, so Swift can count three (ESC-7)', async () => {
    await renderApp('/pin', { phase: PHASES.pinGate });
    for (const pin of ['0000', '1111', '2222']) {
      enterPin(pin);
      await screen.findByText('Wrong PIN. Try again.');
    }
    expect(pinResults()).toEqual(['wrong', 'wrong', 'wrong']);
  });

  test('a wrong PIN then the safe PIN still cancels', async () => {
    await renderApp('/pin', { phase: PHASES.pinGate });
    enterPin('0000');
    await screen.findByText('Wrong PIN. Try again.');
    enterPin(SAFE_PIN);
    expect(await screen.findByText('Cancelled. Stay safe.')).toBeTruthy();
    expect(pinResults()).toEqual(['wrong', 'safe']);
  });

  test('a second tap while the PIN is being checked is ignored', async () => {
    await renderApp('/pin', { phase: PHASES.pinGate });
    fireEvent.changeText(screen.getByLabelText('PIN'), SAFE_PIN);
    const submit = screen.getByRole('button', { name: 'Submit' });
    fireEvent.press(submit);
    fireEvent.press(submit);
    await screen.findByText('Cancelled. Stay safe.');
    expect(pinResults()).toEqual(['safe']);
  });

  test('a Keychain failure says so, sends nothing (no strike) and lets the wearer try again', async () => {
    await renderApp('/pin', { phase: PHASES.pinGate });
    fakeSecureStore().failNext('getItemAsync', new Error('errSecInteractionNotAllowed'));
    enterPin(SAFE_PIN);
    expect(await screen.findByText("Couldn't check your PIN. Try again.")).toBeTruthy();
    expect(pinResults()).toEqual([]);
    expect(screen.queryByText('Wrong PIN. Try again.')).toBeNull();

    enterPin(SAFE_PIN);
    expect(await screen.findByText('Cancelled. Stay safe.')).toBeTruthy();
    expect(pinResults()).toEqual(['safe']);
  });

  test('with no PINs set it says so, and every PIN is wrong', async () => {
    await appPinStore().clearPins();
    await renderApp('/pin', { phase: PHASES.pinGate });
    expect(screen.getByText('No PINs are set, so every PIN counts as wrong. Set them in Setup.')).toBeTruthy();
    enterPin('1111');
    expect(await screen.findByText('Wrong PIN. Try again.')).toBeTruthy();
    expect(pinResults()).toEqual(['wrong']);
  });

  test('Done returns to the session', async () => {
    const app = await renderApp('/pin', { phase: PHASES.pinGate });
    enterPin(SAFE_PIN);
    await screen.findByText('Cancelled. Stay safe.');
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
