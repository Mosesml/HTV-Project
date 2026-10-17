import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import type { Settings } from '../../modules/raveguard-native';
import { appPinStore } from '../../src/pin/PinStoreProvider';
import { DEFAULT_PERMISSIONS } from '../../src/settings/defaults';
import { FIRST_CONTACT_PERMISSIONS, VENUE_STAFF_PERMISSIONS } from '../../src/setup/setupRows';
import { fakeFileSystem, SETTINGS_URI } from '../../test-utils/fakeFiles';
import { calledMethods, nativeMock, PHASES } from '../../test-utils/nativeMock';
import { emitPhase, renderApp } from '../../test-utils/renderApp';

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

/** Scenario 7's setup: 9 fields typed, no toggles, then one tap on Save setup. */
function fillScenario7(pins: { safe: string; duress: string } = { safe: SAFE_PIN, duress: DURESS_PIN }): void {
  type('Your name', 'Alex');
  type('Name, recipient 1', 'Sam');
  type('Phone, recipient 1', '416 555 0101');
  type('Name, recipient 2', 'Riley');
  type('Phone, recipient 2', '(416) 555-0102');
  type('Name, recipient 3', 'Front desk');
  type('Phone, recipient 3', '4165550103');
  type('Safe PIN', pins.safe);
  type('Duress PIN', pins.duress);
}

function pressSave(): void {
  fireEvent.press(screen.getByRole('button', { name: 'Save setup' }));
}

function configuredSettings(): Settings {
  const call = nativeMock().calls.find((c) => c.method === 'configure');
  if (!call) throw new Error('configure() was not called');
  return call.args[0] as Settings;
}

async function completeSetup(): ReturnType<typeof renderApp> {
  const app = await renderApp('/setup');
  fillScenario7();
  pressSave();
  expect(await screen.findByText('Setup saved.')).toBeTruthy();
  return app;
}

describe('Setup flow (K5)', () => {
  test('a fresh install opens the setup form, not Start session', async () => {
    await renderApp('/setup');
    expect(screen.getByText('Not set up yet. This takes under a minute.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save setup' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start session' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  test('scenario 7 in one pass: 9 fields and one tap save it, send it through configure() and set both PINs', async () => {
    await renderApp('/setup');
    fillScenario7();
    pressSave();

    expect(await screen.findByText('Setup saved.')).toBeTruthy();
    const sent = configuredSettings();
    expect(sent.wearerName).toBe('Alex');
    expect(sent.recipients.map((r) => [r.order, r.name, r.phoneE164, r.kind, r.permissions.seeLocation])).toEqual([
      [1, 'Sam', '+14165550101', 'contact', true],
      [2, 'Riley', '+14165550102', 'contact', false],
      [3, 'Front desk', '+14165550103', 'venueStaff', true],
    ]);
    expect(sent.recipients.map((r) => r.permissions)).toEqual([
      FIRST_CONTACT_PERMISSIONS,
      DEFAULT_PERMISSIONS,
      VENUE_STAFF_PERMISSIONS,
    ]);
    expect(JSON.parse(fakeFileSystem().files.get(SETTINGS_URI) ?? '{}').settings).toEqual(sent);
    expect(await appPinStore().verify(SAFE_PIN)).toBe('safe');
    expect(await appPinStore().verify(DURESS_PIN)).toBe('duress');
    expect(screen.getByText('Safe and duress PINs set')).toBeTruthy();
    expect(screen.getByText('1. Sam (contact)')).toBeTruthy();
    expect(screen.getByText('2. Riley (contact)')).toBeTruthy();
    expect(screen.getByText('Gets alerts, can resolve')).toBeTruthy();
  });

  test('then Start session sends the new settings and starts', async () => {
    await completeSetup();
    nativeMock().reset();
    fireEvent.press(screen.getByRole('button', { name: 'Start session' }));
    expect(await screen.findByText('Session running')).toBeTruthy();
    expect(calledMethods()).toEqual(['configure', 'startSession']);
    expect((nativeMock().calls[0].args[0] as Settings).wearerName).toBe('Alex');
  });

  test('PINs must differ: the same PIN twice is refused and nothing is saved', async () => {
    await renderApp('/setup');
    fillScenario7({ safe: SAFE_PIN, duress: SAFE_PIN });
    pressSave();

    expect(await screen.findByText('Must be different from your safe PIN')).toBeTruthy();
    expect(screen.getByText('Fix the fields marked in red, then save again.')).toBeTruthy();
    expect(calledMethods()).toEqual([]);
    expect(fakeFileSystem().files.size).toBe(0);
    expect(await appPinStore().hasPins()).toBe(false);
  });

  test('the "must differ" error clears as soon as the duress PIN is changed, and then it saves', async () => {
    await renderApp('/setup');
    fillScenario7({ safe: SAFE_PIN, duress: SAFE_PIN });
    pressSave();
    expect(await screen.findByText('Must be different from your safe PIN')).toBeTruthy();

    type('Duress PIN', DURESS_PIN);
    expect(screen.queryByText('Must be different from your safe PIN')).toBeNull();
    pressSave();
    expect(await screen.findByText('Setup saved.')).toBeTruthy();
    expect(await appPinStore().verify(DURESS_PIN)).toBe('duress');
  });

  test('saving an empty form marks every missing field', async () => {
    await renderApp('/setup');
    pressSave();
    expect(await screen.findByText('Enter your name')).toBeTruthy();
    expect(screen.getByText('Add at least one contact to text')).toBeTruthy();
    expect(screen.getAllByText('Enter 4 to 8 digits')).toHaveLength(2);
    expect(calledMethods()).toEqual([]);
  });

  test('a bad phone number is marked on its own row', async () => {
    await renderApp('/setup');
    fillScenario7();
    type('Phone, recipient 2', '555-01');
    pressSave();
    expect(await screen.findByText('Enter a full phone number, like 416 555 0123 or +44 20 7946 0958')).toBeTruthy();
    expect(calledMethods()).toEqual([]);
  });

  test('the interval, loudness target and self-description are saved', async () => {
    await renderApp('/setup');
    fillScenario7();
    fireEvent.press(screen.getByRole('radio', { name: 'Every 60 min' }));
    type('Loudness target in dB', '92');
    type('About you', 'Green jacket, front left');
    pressSave();
    expect(await screen.findByText('Setup saved.')).toBeTruthy();
    expect(configuredSettings()).toMatchObject({
      intervalMin: 60,
      loudnessTarget: 92,
      selfDescription: 'Green jacket, front left',
    });
  });

  test('the interval choices say which one is picked', async () => {
    await renderApp('/setup');
    expect(screen.getByRole('radio', { name: 'Every 30 min' }).props.accessibilityState).toMatchObject({ checked: true });
    fireEvent.press(screen.getByRole('radio', { name: 'Every 60 min' }));
    expect(screen.getByRole('radio', { name: 'Every 60 min' }).props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByRole('radio', { name: 'Every 30 min' }).props.accessibilityState).toMatchObject({ checked: false });
  });

  test('the permissions grid changes what each recipient may do', async () => {
    await renderApp('/setup');
    fillScenario7();
    fireEvent(screen.getByRole('switch', { name: 'Sees location, recipient 1' }), 'valueChange', false);
    fireEvent(screen.getByRole('switch', { name: 'Sees full brief, recipient 2' }), 'valueChange', true);
    fireEvent(screen.getByRole('switch', { name: 'Can resolve, recipient 3' }), 'valueChange', false);
    fireEvent(screen.getByRole('switch', { name: 'Gets alerts, recipient 3' }), 'valueChange', false);
    pressSave();
    expect(await screen.findByText('Setup saved.')).toBeTruthy();
    const [first, second, staff] = configuredSettings().recipients;
    expect(first.permissions.seeLocation).toBe(false);
    expect(second.permissions.seeFullBrief).toBe(true);
    expect(staff.permissions).toMatchObject({ canResolve: false, receiveAlerts: false });
  });

  test('Move up changes who is texted first', async () => {
    await renderApp('/setup');
    fillScenario7();
    fireEvent.press(screen.getByRole('button', { name: 'Move recipient 2 up' }));
    expect(screen.getByLabelText('Name, recipient 1').props.value).toBe('Riley');
    pressSave();
    expect(await screen.findByText('Setup saved.')).toBeTruthy();
    expect(configuredSettings().recipients.map((r) => [r.order, r.name, r.permissions.seeLocation])).toEqual([
      [1, 'Riley', false],
      [2, 'Sam', true],
      [3, 'Front desk', true],
    ]);
  });

  test('recipients can be removed and added', async () => {
    await renderApp('/setup');
    fillScenario7();
    fireEvent.press(screen.getByRole('button', { name: 'Remove recipient 3' }));
    expect(screen.queryByLabelText('Name, recipient 3')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Add venue staff' }));
    type('Name, recipient 3', 'Security');
    type('Phone, recipient 3', '4165550104');
    fireEvent.press(screen.getByRole('button', { name: 'Add contact' }));
    expect(screen.getByLabelText('Name, recipient 4')).toBeTruthy();
    pressSave();
    expect(await screen.findByText('Setup saved.')).toBeTruthy();
    expect(configuredSettings().recipients.map((r) => [r.name, r.kind])).toEqual([
      ['Sam', 'contact'],
      ['Riley', 'contact'],
      ['Security', 'venueStaff'],
    ]);
  });

  test('PINs are hidden until Show PINs is on', async () => {
    await renderApp('/setup');
    expect(screen.getByLabelText('Safe PIN').props.secureTextEntry).toBe(true);
    expect(screen.getByLabelText('Duress PIN').props.secureTextEntry).toBe(true);
    fireEvent(screen.getByRole('switch', { name: 'Show PINs' }), 'valueChange', true);
    expect(screen.getByLabelText('Safe PIN').props.secureTextEntry).toBe(false);
    expect(screen.getByLabelText('Duress PIN').props.secureTextEntry).toBe(false);
  });

  test('Edit setup reopens the form filled in, and blank PINs keep the old ones', async () => {
    await completeSetup();
    fireEvent.press(screen.getByRole('button', { name: 'Edit setup' }));
    expect(screen.getByLabelText('Your name').props.value).toBe('Alex');
    expect(screen.getByLabelText('Phone, recipient 1').props.value).toBe('+14165550101');
    expect(screen.getByText('Leave both PINs blank to keep the ones you set.')).toBeTruthy();

    type('Your name', 'Alex P');
    pressSave();
    expect(await screen.findByText('Setup saved.')).toBeTruthy();
    expect(screen.getByText('Wearer: Alex P')).toBeTruthy();
    expect(await appPinStore().verify(SAFE_PIN)).toBe('safe');
    expect(await appPinStore().verify(DURESS_PIN)).toBe('duress');
  });

  test('editing keeps recipient ids, so the server sees the same people', async () => {
    await completeSetup();
    const before = configuredSettings().recipients.map((r) => r.id);
    nativeMock().reset();
    fireEvent.press(screen.getByRole('button', { name: 'Edit setup' }));
    pressSave();
    expect(await screen.findByText('Setup saved.')).toBeTruthy();
    expect(configuredSettings().recipients.map((r) => r.id)).toEqual(before);
  });

  test('new PINs can be set while editing', async () => {
    await completeSetup();
    fireEvent.press(screen.getByRole('button', { name: 'Edit setup' }));
    type('Safe PIN', '8642');
    type('Duress PIN', '7531');
    pressSave();
    expect(await screen.findByText('Setup saved.')).toBeTruthy();
    expect(await appPinStore().verify('8642')).toBe('safe');
    expect(await appPinStore().verify(SAFE_PIN)).toBe('wrong');
  });

  test('Cancel leaves the saved setup as it was', async () => {
    await completeSetup();
    nativeMock().reset();
    fireEvent.press(screen.getByRole('button', { name: 'Edit setup' }));
    type('Your name', 'Someone else');
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Wearer: Alex')).toBeTruthy();
    expect(calledMethods()).toEqual([]);
  });

  test('setup cannot be edited while a session is running', async () => {
    await completeSetup();
    await emitPhase(PHASES.monitoring);
    expect(screen.getByRole('button', { name: 'Edit setup' }).props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText('Stop the session to change your setup.')).toBeTruthy();
  });

  test('when configure() fails, the error shows, the form stays and the PINs are not set', async () => {
    jest.spyOn(nativeMock(), 'configure').mockRejectedValueOnce(new Error('Swift said no'));
    await renderApp('/setup');
    fillScenario7();
    pressSave();
    expect(await screen.findByText('Swift said no')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save setup' })).toBeTruthy();
    expect(await appPinStore().hasPins()).toBe(false);
  });

  test('the Save button reads Saving… while it saves', async () => {
    let finish: () => void = () => {};
    jest.spyOn(nativeMock(), 'configure').mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
    await renderApp('/setup');
    fillScenario7();
    pressSave();
    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeTruthy();
    finish();
    await waitFor(() => expect(screen.getByText('Setup saved.')).toBeTruthy());
  });

  test('saved settings without PINs (after a relaunch, until K6) show the summary with PINs not set', async () => {
    const first = await completeSetup();
    first.unmount();
    // A relaunch: the settings file is still there, the in-memory PINs are gone.
    await appPinStore().clearPins();
    await renderApp('/setup');
    expect(await screen.findByText('PINs not set: tap Edit setup to add them.')).toBeTruthy();
  });
});
