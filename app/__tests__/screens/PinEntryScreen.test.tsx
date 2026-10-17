import { router } from 'expo-router';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { appPinStore } from '../../src/pin/PinStoreProvider';
import { fakeSecureStore } from '../../test-utils/fakeSecureStoreControls';
import { nativeMock, PHASES } from '../../test-utils/nativeMock';
import { emitPhase, renderApp } from '../../test-utils/renderApp';

// The PINs the wearer set in Setup, kept as salted hashes in the (fake) Keychain (K6).
const SAFE_PIN = '2468';
const DURESS_PIN = '1357';
/** Any fixed instant: both recordings start here so "Checked in at" can be compared. */
const CLOCK_START = new Date(2026, 9, 17, 1, 46, 5).getTime();

// The whole file runs on Jest's fake clock, as in CheckInScreen.test.tsx: the 600 ms
// "Cancelling…" (K9) then passes as findBy* waits, without slowing the suite.
beforeAll(() => jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] }));
afterAll(() => jest.useRealTimers());

afterEach(async () => {
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
});

beforeEach(async () => {
  nativeMock().reset();
  fakeSecureStore().reset();
  await appPinStore().setPins({ safePin: SAFE_PIN, duressPin: DURESS_PIN });
});

function typeDigits(digits: string): void {
  for (const digit of digits) fireEvent.press(screen.getByRole('button', { name: digit }));
}

function submitButton() {
  return screen.getByRole('button', { name: 'Submit PIN' });
}

/** Types `pin` on the keypad and presses Submit. */
function enterPin(pin: string): void {
  typeDigits(pin);
  fireEvent.press(submitButton());
}

function pinResults(): unknown[] {
  return nativeMock()
    .calls.filter((call) => call.method === 'pinResult')
    .map((call) => call.args[0]);
}

const CANCELLED = { name: 'Cancelled. Stay safe.' } as const;
const TEXTED_COPY = "Your contacts have been texted. Your PIN tells them you're okay.";

/** What Alert's and SOS's "I'm okay now" do (their copy is alert-sos's to change). */
async function openPinGate(): Promise<void> {
  await act(async () => {
    router.push('/pin');
  });
}

async function findCancelled() {
  return screen.findByRole('header', CANCELLED);
}

async function screenAfterPin(pin: string) {
  nativeMock().reset();
  jest.setSystemTime(CLOCK_START);
  const app = await renderApp('/pin', { phase: PHASES.pinGate });
  enterPin(pin);
  await findCancelled();
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
    expect(await findCancelled()).toBeTruthy();
    expect(pinResults()).toEqual(['safe']);
  });

  test('the duress PIN from Setup shows the same screen and reports duress', async () => {
    await renderApp('/pin', { phase: PHASES.pinGate });
    enterPin(DURESS_PIN);
    expect(await findCancelled()).toBeTruthy();
    expect(pinResults()).toEqual(['duress']);
  });

  test('duress rule: safe and duress leave identical screens and stay on PIN entry', async () => {
    const safe = await screenAfterPin(SAFE_PIN);
    const duress = await screenAfterPin(DURESS_PIN);
    expect(duress.tree).toEqual(safe.tree);
    expect(safe.pathname).toBe('/pin');
    expect(duress.pathname).toBe('/pin');
  });

  test('a wrong PIN says so, reports wrong, clears the dots and lets the wearer try again', async () => {
    await renderApp('/pin', { phase: PHASES.pinGate });
    enterPin('1234');
    expect(await screen.findByText('Wrong PIN. Try again.')).toBeTruthy();
    expect(screen.getByLabelText('0 of 4 digits entered')).toBeTruthy();
    expect(pinResults()).toEqual(['wrong']);
  });

  test('the old placeholder PINs 1111 and 9999 are now wrong', async () => {
    await renderApp('/pin', { phase: PHASES.pinGate });
    enterPin('1111');
    expect(await screen.findByText('Wrong PIN. Try again.')).toBeTruthy();
    enterPin('9999');
    await screen.findByText('Wrong PIN. Try again.');
    expect(pinResults()).toEqual(['wrong', 'wrong']);
    expect(screen.queryByRole('header', CANCELLED)).toBeNull();
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
    expect(await findCancelled()).toBeTruthy();
    expect(pinResults()).toEqual(['wrong', 'safe']);
  });

  test('a second tap while the PIN is being checked is ignored', async () => {
    await renderApp('/pin', { phase: PHASES.pinGate });
    typeDigits(SAFE_PIN);
    const submit = submitButton();
    fireEvent.press(submit);
    fireEvent.press(submit);
    await findCancelled();
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
    expect(await findCancelled()).toBeTruthy();
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

  test('"Back to my session" returns to the session', async () => {
    const app = await renderApp('/pin', { phase: PHASES.pinGate });
    enterPin(SAFE_PIN);
    await findCancelled();
    await emitPhase(PHASES.monitoring);
    fireEvent.press(await screen.findByRole('button', { name: 'Back to my session' }));
    await waitFor(() => expect(app.getPathname()).toBe('/session'));
  });

  test('the third wrong PIN escalating opens Alert', async () => {
    const app = await renderApp('/pin', { phase: PHASES.pinGate });
    await emitPhase(PHASES.escalated);
    expect(app.getPathname()).toBe('/alert');
  });
});

describe('PIN gate layout (PIN-Gate.html)', () => {
  test('shows the ladder on the PIN stage, the heading and four empty dots', async () => {
    await renderApp('/pin', { phase: PHASES.pinGate });
    expect(screen.getByLabelText('Step 3 of 3: PIN')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Enter your PIN to cancel' })).toBeTruthy();
    expect(screen.getByLabelText('0 of 4 digits entered')).toBeTruthy();
  });

  test('the keypad fills the dots, delete takes one away, and the dots grow past four', async () => {
    await renderApp('/pin', { phase: PHASES.pinGate });
    typeDigits('12');
    expect(screen.getByLabelText('2 of 4 digits entered')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Delete digit' }));
    expect(screen.getByLabelText('1 of 4 digits entered')).toBeTruthy();
    typeDigits('2345');
    expect(screen.getByLabelText('5 of 5 digits entered')).toBeTruthy();
  });

  test('takes at most 8 digits', async () => {
    await renderApp('/pin', { phase: PHASES.pinGate });
    typeDigits('1234567890');
    expect(screen.getByLabelText('8 of 8 digits entered')).toBeTruthy();
  });

  test('Submit is off until 4 digits are in, so a short entry is never a strike', async () => {
    await renderApp('/pin', { phase: PHASES.pinGate });
    typeDigits('246');
    expect(submitButton()).toBeDisabled();
    fireEvent.press(submitButton());
    expect(pinResults()).toEqual([]);
    typeDigits('8');
    expect(submitButton()).toBeEnabled();
  });

  test('a 6-digit safe PIN cancels (no auto-submit at 4 digits)', async () => {
    await appPinStore().setPins({ safePin: '246813', duressPin: '135792' });
    await renderApp('/pin', { phase: PHASES.pinGate });
    typeDigits('2468');
    // Four digits in: nothing has been checked or sent yet.
    await act(async () => {});
    expect(pinResults()).toEqual([]);
    expect(screen.queryByText('Cancelling…')).toBeNull();
    typeDigits('13');
    fireEvent.press(submitButton());
    expect(await findCancelled()).toBeTruthy();
    expect(pinResults()).toEqual(['safe']);
  });

  test('counts down to the texts from stageEndsAt, with the coral bar', async () => {
    const endsAt = Date.now() + 15_000;
    await renderApp('/pin', { phase: { ...PHASES.pinGate, stageEndsAt: endsAt } });
    expect(screen.getByText('0:15')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(6_000);
    });
    expect(screen.getByText('0:09')).toBeTruthy();
    const bar = screen.getByRole('progressbar', { name: 'Time to enter your PIN' });
    expect(bar.props.accessibilityValue.text).toBe('9 of 15 seconds left');
    expect(screen.getByLabelText('Your contacts get a text in 0:09')).toBeTruthy();
  });

  test('opened from Alert after the texts went out: neutral copy, no countdown, no ladder', async () => {
    const app = await renderApp('/alert', { phase: { ...PHASES.escalated, stageEndsAt: Date.now() + 15_000 } });
    await openPinGate();
    expect(app.getPathname()).toBe('/pin');
    expect(screen.getByText(TEXTED_COPY)).toBeTruthy();
    expect(screen.queryByRole('progressbar', { name: 'Time to enter your PIN' })).toBeNull();
    expect(screen.queryByText(/get a text in/)).toBeNull();
    expect(screen.queryByLabelText('Step 3 of 3: PIN')).toBeNull();
  });

  test('opened from Alert, Back returns to Alert without sending anything', async () => {
    const app = await renderApp('/alert', { phase: PHASES.escalated });
    await openPinGate();
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(app.getPathname()).toBe('/alert'));
    expect(pinResults()).toEqual([]);
  });

  test('during the check-in there is no Back: the session decides when the gate closes', async () => {
    await renderApp('/pin', { phase: PHASES.pinGate });
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  test('opened from SOS: the same neutral copy, and the PIN still cancels', async () => {
    const app = await renderApp('/sos', { phase: PHASES.sos });
    await openPinGate();
    expect(screen.getByText(TEXTED_COPY)).toBeTruthy();
    enterPin(DURESS_PIN);
    expect(await findCancelled()).toBeTruthy();
    expect(pinResults()).toEqual(['duress']);
    expect(app.getPathname()).toBe('/pin');
  });

  test('Cancelled says when the wearer checked in', async () => {
    jest.setSystemTime(CLOCK_START);
    await renderApp('/pin', { phase: PHASES.pinGate });
    enterPin(SAFE_PIN);
    await findCancelled();
    expect(screen.getByText('Checked in at 01:46')).toBeTruthy();
  });
});
