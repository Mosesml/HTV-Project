import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';

import type { Settings } from '../../modules/raveguard-native';
import { appPinStore } from '../../src/pin/PinStoreProvider';
import { DEFAULT_PERMISSIONS } from '../../src/settings/defaults';
import { fakeFileSystem, SETTINGS_URI } from '../../test-utils/fakeFiles';
import { calledMethods, nativeMock, PHASES } from '../../test-utils/nativeMock';
import { emitPhase, renderApp } from '../../test-utils/renderApp';

// The four setup steps as one flow (K5, PRD D5 / UI-1), from a fresh install and from Home's
// Settings. Ported from the one-page form's SetupFlow tests: every rule they checked is checked
// here against the redesigned steps.

const SAFE_PIN = '2468';
const DURESS_PIN = '1357';

beforeEach(async () => {
  nativeMock().reset();
  fakeFileSystem().reset();
  await appPinStore().clearPins();
});

function type(label: string, text: string): void {
  fireEvent.changeText(screen.getByLabelText(label), text);
}

function press(name: string | RegExp): void {
  fireEvent.press(screen.getByRole('button', { name }));
}

async function goTo(nextLabel: string, step: number): Promise<void> {
  press(nextLabel);
  expect(await screen.findByText(`Step ${step} of 3`)).toBeTruthy();
}

/** Opens a PIN card's entry, types the PIN on the keypad and uses it. */
function setPin(card: 'safe PIN' | 'duress PIN', pin: string): void {
  press(new RegExp(`^(Set|Change) ${card}$`));
  [...pin].forEach((digit) => press(digit));
  press('Use this PIN');
}

/** Scenario 7's step 1: your name and three recipients, typed straight into the starter rows. */
function fillContacts(): void {
  type('Your name', 'Alex');
  type('Name, recipient 1', 'Sam');
  type('Phone, recipient 1', '416 555 0101');
  type('Name, recipient 2', 'Riley');
  type('Phone, recipient 2', '(416) 555-0102');
  type('Name, recipient 3', 'Front desk');
  type('Phone, recipient 3', '4165550103');
}

/** Walk through Contacts and Session settings to PINs. */
async function walkToPins(): Promise<void> {
  await goTo('Next: session settings', 2);
  await goTo('Next: your PINs', 3);
}

function configuredSettings(): Settings {
  const call = nativeMock().calls.find((c) => c.method === 'configure');
  if (!call) throw new Error('configure() was not called');
  return call.args[0] as Settings;
}

async function finish(): Promise<void> {
  press('Save settings');
  expect(await screen.findByText('RaveGuard')).toBeTruthy();
}

/** A fresh install set up the scenario 7 way, ending on Home. */
async function completeSetup(): ReturnType<typeof renderApp> {
  const app = await renderApp('/');
  fillContacts();
  await walkToPins();
  setPin('safe PIN', SAFE_PIN);
  setPin('duress PIN', DURESS_PIN);
  await finish();
  return app;
}

async function openSettings(): Promise<void> {
  press('Settings');
  expect(await screen.findByText('Step 1 of 3')).toBeTruthy();
}

describe('Setup steps, fresh install (K5)', () => {
  test('opens on step 1 with nowhere to go back to, and no Start session', async () => {
    const app = await renderApp('/');
    expect(app.getPathname()).toBe('/setup/contacts');
    expect(screen.getByLabelText('Your name').props.value).toBe('');
    expect(screen.getByLabelText('Name, recipient 1')).toBeTruthy();
    expect(screen.getByLabelText('Name, recipient 3')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back to Home' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start session' })).toBeNull();
  });

  test('scenario 7 in one pass: saves through configure(), sets both PINs and lands on Home', async () => {
    const app = await completeSetup();

    expect(app.getPathname()).toBe('/');
    expect(screen.getByText('RaveGuard')).toBeTruthy();
    expect(screen.getByLabelText('Alert chain, Sam → Riley → Venue staff')).toBeTruthy();
    const sent = configuredSettings();
    expect(sent.wearerName).toBe('Alex');
    expect(sent.recipients.map((r) => [r.order, r.name, r.phoneE164, r.kind, r.permissions.seeLocation])).toEqual([
      [1, 'Sam', '+14165550101', 'contact', true],
      [2, 'Riley', '+14165550102', 'contact', true],
      [3, 'Front desk', '+14165550103', 'venueStaff', true],
    ]);
    expect(sent.recipients.map((r) => r.permissions)).toEqual([DEFAULT_PERMISSIONS, DEFAULT_PERMISSIONS, DEFAULT_PERMISSIONS]);
    expect(JSON.parse(fakeFileSystem().files.get(SETTINGS_URI) ?? '{}').settings).toEqual(sent);
    expect(await appPinStore().verify(SAFE_PIN)).toBe('safe');
    expect(await appPinStore().verify(DURESS_PIN)).toBe('duress');
  });

  test('then Start session on Home sends the new settings and starts', async () => {
    await completeSetup();
    nativeMock().reset();
    press('Start session');
    await waitFor(() => expect(calledMethods()).toEqual(['configure', 'startSession']));
    expect((nativeMock().calls[0].args[0] as Settings).wearerName).toBe('Alex');
  });

  test('Next on an empty step 1 marks every missing field and stays', async () => {
    const app = await renderApp('/');
    press('Next: session settings');
    expect(await screen.findByText('Enter your name')).toBeTruthy();
    expect(screen.getByText('Add at least one contact to text')).toBeTruthy();
    expect(screen.getByRole('alert')).toHaveTextContent('Fix the fields marked in red to go on.');
    expect(app.getPathname()).toBe('/setup/contacts');
    expect(calledMethods()).toEqual([]);
  });

  test('an error clears as soon as the field is fixed', async () => {
    await renderApp('/');
    press('Next: session settings');
    expect(await screen.findByText('Enter your name')).toBeTruthy();
    type('Your name', 'Alex');
    expect(screen.queryByText('Enter your name')).toBeNull();
  });

  test('a bad phone number is marked on its own row', async () => {
    const app = await renderApp('/');
    fillContacts();
    type('Phone, recipient 2', '555-01');
    press('Next: session settings');
    expect(await screen.findByText('Enter a full phone number, like 416 555 0123 or +44 20 7946 0958')).toBeTruthy();
    expect(app.getPathname()).toBe('/setup/contacts');
  });

  test('the same number twice is marked on the later row', async () => {
    await renderApp('/');
    fillContacts();
    type('Phone, recipient 2', '416 555 0101');
    press('Next: session settings');
    expect(await screen.findByText('Same number as recipient 1')).toBeTruthy();
  });

  test('Finish with no PINs marks both and saves nothing', async () => {
    await renderApp('/');
    fillContacts();
    await walkToPins();
    press('Save settings');
    expect(await screen.findAllByText('Enter 4 to 8 digits')).toHaveLength(2);
    expect(calledMethods()).toEqual([]);
    expect(fakeFileSystem().files.size).toBe(0);
    expect(await appPinStore().hasPins()).toBe(false);
  });

  test('PINs must differ: the duress PIN entry refuses the safe PIN, and the error clears once it changes', async () => {
    await renderApp('/');
    fillContacts();
    await walkToPins();
    setPin('safe PIN', SAFE_PIN);
    press('Set duress PIN');
    [...SAFE_PIN].forEach((digit) => press(digit));
    press('Use this PIN');
    expect(screen.getByText('Must be different from your safe PIN')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'New duress PIN' })).toBeTruthy();

    press('Delete digit');
    press('9');
    expect(screen.queryByText('Must be different from your safe PIN')).toBeNull();
    press('Use this PIN');
    expect(screen.getByText('PINs are different')).toBeTruthy();
    await finish();
    expect(await appPinStore().verify('2469')).toBe('duress');
  });

  test('a PIN is never shown, only dots', async () => {
    await renderApp('/');
    fillContacts();
    await walkToPins();
    expect(screen.getByLabelText('Safe PIN not set')).toBeTruthy();
    press('Set safe PIN');
    [...SAFE_PIN].forEach((digit) => press(digit));
    expect(screen.getByLabelText('4 of 4 digits entered')).toBeTruthy();
    expect(screen.queryByText(SAFE_PIN)).toBeNull();
    press('Use this PIN');
    expect(screen.getByLabelText('Safe PIN set, 4 digits')).toBeTruthy();
    expect(screen.queryByText(SAFE_PIN)).toBeNull();
  });

  test('cancelling a PIN entry keeps the card as it was', async () => {
    await renderApp('/');
    fillContacts();
    await walkToPins();
    press('Set safe PIN');
    press('1');
    press('Cancel PIN change');
    expect(screen.getByLabelText('Safe PIN not set')).toBeTruthy();
  });

  test('Three wrong PINs is explained on the PIN step', async () => {
    await renderApp('/setup/pins');
    expect(screen.getByText('3 wrong attempts send an alert.')).toBeTruthy();
  });

  test('the interval, loudness, what you are wearing and the meeting spot are saved', async () => {
    await renderApp('/');
    fillContacts();
    await goTo('Next: session settings', 2);
    fireEvent.press(screen.getByRole('radio', { name: 'Every 60 min' }));
    fireEvent.press(screen.getByRole('radio', { name: 'Louder, 90 dB' }));
    type("What you're wearing", 'Green jacket, front left');
    type('Meeting spot', 'Left of the main stage, by the bar');
    await goTo('Next: your PINs', 3);
    setPin('safe PIN', SAFE_PIN);
    setPin('duress PIN', DURESS_PIN);
    await finish();
    expect(configuredSettings()).toMatchObject({
      intervalMin: 60,
      loudnessTarget: 90,
      selfDescription: 'Green jacket, front left',
      meetingSpot: 'Left of the main stage, by the bar',
    });
    expect(screen.getByLabelText('Check-ins every 60 min, Whispered in your ear. Nod twice to answer.')).toBeTruthy();
  });

  test('Quieter, Balanced and Louder are 80, 85 and 90 dB, and say which is picked', async () => {
    await renderApp('/');
    fillContacts();
    await goTo('Next: session settings', 2);
    expect(screen.getByRole('radio', { name: 'Balanced, 85 dB' }).props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByRole('radio', { name: 'Every 30 min' }).props.accessibilityState).toMatchObject({ checked: true });
    fireEvent.press(screen.getByRole('radio', { name: 'Quieter, 80 dB' }));
    expect(screen.getByRole('radio', { name: 'Quieter, 80 dB' }).props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByRole('radio', { name: 'Balanced, 85 dB' }).props.accessibilityState).toMatchObject({ checked: false });
    await goTo('Next: your PINs', 3);
    setPin('safe PIN', SAFE_PIN);
    setPin('duress PIN', DURESS_PIN);
    await finish();
    expect(configuredSettings().loudnessTarget).toBe(80);
  });

  test('all contacts save with alerts, location and details on, and resolve off', async () => {
    await completeSetup();
    expect(configuredSettings().recipients.every((recipient) =>
      recipient.permissions.receiveAlerts && recipient.permissions.seeLocation &&
      recipient.permissions.seeFullBrief && !recipient.permissions.canResolve
    )).toBe(true);
  });

  test('Move up changes who is texted first, permissions travelling with the person', async () => {
    await renderApp('/');
    fillContacts();
    press('Move recipient 2 up');
    expect(screen.getByLabelText('Name, recipient 1').props.value).toBe('Riley');
    await walkToPins();
    setPin('safe PIN', SAFE_PIN);
    setPin('duress PIN', DURESS_PIN);
    await finish();
    expect(configuredSettings().recipients.map((r) => [r.order, r.name, r.permissions.seeLocation])).toEqual([
      [1, 'Riley', true],
      [2, 'Sam', true],
      [3, 'Front desk', true],
    ]);
  });

  test('a closed row moves with VoiceOver actions and shows the mockup row', async () => {
    await renderApp('/');
    fillContacts();
    press('Done with recipient 1');
    press('Done with recipient 2');
    const row = screen.getByRole('button', { name: '1. Sam, 416 555 0101 · Contact' });
    expect(row.props.accessibilityActions).toEqual([{ name: 'moveDown', label: 'Move down' }]);
    fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'moveDown' } });
    expect(screen.getByRole('button', { name: '1. Riley, (416) 555-0102 · Contact' })).toBeTruthy();
    const moved = screen.getByRole('button', { name: '2. Sam, 416 555 0101 · Contact' });
    expect(moved.props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual(['moveUp', 'moveDown']);
    fireEvent(moved, 'accessibilityAction', { nativeEvent: { actionName: 'moveUp' } });
    expect(screen.getByRole('button', { name: '1. Sam, 416 555 0101 · Contact' })).toBeTruthy();
    expect(screen.getByTestId('drag-handle-1', { includeHiddenElements: true })).toBeTruthy();
  });

  test('a closed row opens again for editing', async () => {
    await renderApp('/');
    fillContacts();
    press('Done with recipient 1');
    expect(screen.queryByLabelText('Name, recipient 1')).toBeNull();
    press('1. Sam, 416 555 0101 · Contact');
    expect(screen.getByLabelText('Name, recipient 1').props.value).toBe('Sam');
  });

  test('recipients can be removed, added and switched to venue staff', async () => {
    await renderApp('/');
    fillContacts();
    press('Remove recipient 3');
    expect(screen.queryByLabelText('Name, recipient 3')).toBeNull();
    press('Add a contact');
    fireEvent.press(screen.getByRole('radio', { name: 'Venue staff, recipient 3' }));
    type('Name, recipient 3', 'Security');
    type('Phone, recipient 3', '4165550104');
    press('Add a contact');
    expect(screen.getByLabelText('Name, recipient 4')).toBeTruthy();
    await walkToPins();
    setPin('safe PIN', SAFE_PIN);
    setPin('duress PIN', DURESS_PIN);
    await finish();
    expect(configuredSettings().recipients.map((r) => [r.name, r.kind])).toEqual([
      ['Sam', 'contact'],
      ['Riley', 'contact'],
      ['Security', 'venueStaff'],
    ]);
  });

  test('quickly adding and removing a contact keeps existing edits and row order', async () => {
    await renderApp('/');
    fillContacts();
    for (let i = 0; i < 3; i += 1) {
      press('Add a contact');
      expect(screen.getByLabelText('Name, recipient 4')).toBeTruthy();
      press('Remove recipient 4');
      expect(screen.queryByLabelText('Name, recipient 4')).toBeNull();
    }
    expect(screen.getByLabelText('Name, recipient 1').props.value).toBe('Sam');
    expect(screen.getByLabelText('Name, recipient 2').props.value).toBe('Riley');
    expect(screen.getByLabelText('Name, recipient 3').props.value).toBe('Front desk');
  });

  test('Finish points back at an earlier step that still needs a fix', async () => {
    const app = await renderApp('/setup/pins');
    setPin('safe PIN', SAFE_PIN);
    setPin('duress PIN', DURESS_PIN);
    press('Save settings');
    expect(await screen.findByText('Check step 1, Contacts Enter your name.')).toBeTruthy();
    expect(calledMethods()).toEqual([]);
    press('Go to step 1');
    await waitFor(() => expect(app.getPathname()).toBe('/setup/contacts'));
    expect(await screen.findByText('Enter your name')).toBeTruthy();
  });

  test('when configure() fails, the error shows, the step stays and the PINs are not set', async () => {
    jest.spyOn(nativeMock(), 'configure').mockRejectedValueOnce(new Error('Swift said no'));
    const app = await renderApp('/');
    fillContacts();
    await walkToPins();
    setPin('safe PIN', SAFE_PIN);
    setPin('duress PIN', DURESS_PIN);
    press('Save settings');
    expect(await screen.findByRole('alert')).toHaveTextContent('Swift said no');
    expect(app.getPathname()).toBe('/setup/pins');
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeTruthy();
    expect(await appPinStore().hasPins()).toBe(false);
  });

  test('Finish reads Saving… while it saves', async () => {
    let done: () => void = () => {};
    jest.spyOn(nativeMock(), 'configure').mockReturnValueOnce(new Promise<void>((resolve) => (done = resolve)));
    await renderApp('/');
    fillContacts();
    await walkToPins();
    setPin('safe PIN', SAFE_PIN);
    setPin('duress PIN', DURESS_PIN);
    press('Save settings');
    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeTruthy();
    await act(async () => done());
    expect(await screen.findByText('RaveGuard')).toBeTruthy();
  });

  test('damaged saved settings are explained on step 1', async () => {
    fakeFileSystem().seed(SETTINGS_URI, 'not json');
    await renderApp('/');
    expect(screen.getByText(/Saved settings are damaged/)).toBeTruthy();
  });
});

describe('Setup steps, editing from Home', () => {
  test('Settings reopens the steps filled in, and blank PINs keep the old ones', async () => {
    await completeSetup();
    await openSettings();
    expect(screen.getByLabelText('Your name').props.value).toBe('Alex');
    expect(screen.getByRole('button', { name: '1. Sam, +14165550101 · Contact' })).toBeTruthy();
    type('Your name', 'Alex P');
    await walkToPins();
    expect(screen.getByText('PINs saved. Leave unchanged to keep them.')).toBeTruthy();
    expect(screen.getByLabelText('Safe PIN set')).toBeTruthy();
    expect(screen.getByText('PINs are different')).toBeTruthy();
    await finish();
    expect(screen.getByText('RaveGuard')).toBeTruthy();
    expect(await appPinStore().verify(SAFE_PIN)).toBe('safe');
    expect(await appPinStore().verify(DURESS_PIN)).toBe('duress');
  });

  test('editing keeps recipient ids, so the server sees the same people', async () => {
    await completeSetup();
    const before = configuredSettings().recipients.map((r) => r.id);
    nativeMock().reset();
    await openSettings();
    await walkToPins();
    await finish();
    expect(configuredSettings().recipients.map((r) => r.id)).toEqual(before);
  });

  test('editing an old contact setup replaces the old permissions when saved', async () => {
    const first = await completeSetup();
    const file = JSON.parse(fakeFileSystem().files.get(SETTINGS_URI) ?? '{}');
    file.settings.recipients.forEach((recipient: Settings['recipients'][number]) => {
      recipient.permissions = { receiveAlerts: true, seeLocation: false, seeFullBrief: false, canResolve: true };
    });
    // Reopen from disk with a current-schema file, so the setup itself must apply the defaults.
    fakeFileSystem().seed(SETTINGS_URI, JSON.stringify(file));
    first.unmount();
    nativeMock().reset();
    const app = await renderApp('/setup/contacts');
    await walkToPins();
    await finish();
    expect(app.getPathname()).toBe('/');
    configuredSettings().recipients.forEach((recipient) => expect(recipient.permissions).toEqual(DEFAULT_PERMISSIONS));
  });

  test('new PINs can be set while editing', async () => {
    await completeSetup();
    await openSettings();
    await walkToPins();
    setPin('safe PIN', '8642');
    setPin('duress PIN', '7531');
    await finish();
    expect(await appPinStore().verify('8642')).toBe('safe');
    expect(await appPinStore().verify('7531')).toBe('duress');
    expect(await appPinStore().verify(SAFE_PIN)).toBe('wrong');
  });

  test('changing one stored PIN asks for the other too', async () => {
    await completeSetup();
    await openSettings();
    await walkToPins();
    setPin('safe PIN', '8642');
    expect(screen.queryByText('PINs are different')).toBeNull();
    press('Save settings');
    expect(await screen.findByText('Change both PINs together')).toBeTruthy();
    expect(await appPinStore().verify(SAFE_PIN)).toBe('safe');
  });

  test('Back to Home leaves the saved setup as it was', async () => {
    const app = await completeSetup();
    nativeMock().reset();
    await openSettings();
    type('Your name', 'Someone else');
    press('Back to Home');
    expect(await screen.findByText('RaveGuard')).toBeTruthy();
    expect(app.getPathname()).toBe('/');
    expect(calledMethods()).toEqual([]);
  });

  test('leaving setup forgets the unsaved draft', async () => {
    await completeSetup();
    await openSettings();
    type('Your name', 'Someone else');
    press('Back to Home');
    await openSettings();
    expect(screen.getByLabelText('Your name').props.value).toBe('Alex');
  });

  test('setup cannot be finished while a session is running', async () => {
    const app = await completeSetup();
    await openSettings();
    await walkToPins();
    await emitPhase(PHASES.monitoring);
    // monitoring only opens Active session at launch or after a check-in; the step stays.
    expect(app.getPathname()).toBe('/setup/pins');
    expect(await screen.findByText('Stop the session to change your setup.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save settings' }).props.accessibilityState).toMatchObject({ disabled: true });
  });
});
