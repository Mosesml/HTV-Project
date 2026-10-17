import { fireEvent, screen } from 'expo-router/testing-library';

import type { Settings } from '../../modules/raveguard-native';
import { appPinStore } from '../../src/pin/PinStoreProvider';
import { DEFAULT_SETTINGS } from '../../src/settings/defaults';
import { addRecipient } from '../../src/settings/recipients';
import { fakeFileSystem, seedSavedSettings } from '../../test-utils/fakeFiles';
import { nativeMock } from '../../test-utils/nativeMock';
import { renderApp } from '../../test-utils/renderApp';

// The four setup steps, one screen at a time (docs/design/screens/Setup-*.html). The flow from
// a fresh install and from Home's Settings is in __tests__/setup/SetupWizard.test.tsx.

const SAVED: Settings = addRecipient(
  addRecipient(
    addRecipient(
      { ...DEFAULT_SETTINGS, wearerName: 'Alex', meetingSpot: 'by the bar', selfDescription: 'Black hoodie, white cap' },
      { name: 'Maya Chen', phone: '+14035550142', kind: 'contact' }
    ),
    { name: 'Theo Park', phone: '+15875550199', kind: 'contact' }
  ),
  { name: 'Main stage medical', phone: '+14035550110', kind: 'venueStaff' }
);

beforeEach(async () => {
  nativeMock().reset();
  fakeFileSystem().reset();
  await appPinStore().clearPins();
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
    seedSavedSettings(SAVED);
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

  test('step 1 lists saved recipients in texting order, closed, with a way to add one', async () => {
    seedSavedSettings(SAVED);
    await renderApp('/setup/contacts');
    expect(screen.getByRole('button', { name: '1. Maya Chen, +14035550142 · Contact' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '2. Theo Park, +15875550199 · Contact' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '3. Main stage medical, +14035550110 · Venue staff' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add a contact' })).toBeTruthy();
    expect(screen.getByLabelText('Your name').props.value).toBe('Alex');
  });

  test('step 1 rows can be moved by VoiceOver: first has only Move down, last only Move up', async () => {
    seedSavedSettings(SAVED);
    await renderApp('/setup/contacts');
    const first = screen.getByRole('button', { name: /^1\. Maya Chen/ });
    const last = screen.getByRole('button', { name: /^3\. Main stage medical/ });
    expect(first.props.accessibilityActions).toEqual([{ name: 'moveDown', label: 'Move down' }]);
    expect(last.props.accessibilityActions).toEqual([{ name: 'moveUp', label: 'Move up' }]);
  });

  test('step 2 has the four permission rows for each recipient, Get alerts locked on', async () => {
    seedSavedSettings(SAVED);
    await renderApp('/setup/permissions');
    for (const who of ['Maya', 'Theo', 'Venue staff']) {
      expect(screen.getByRole('switch', { name: `${who}: get alerts` }).props.accessibilityState).toMatchObject({
        checked: true,
        disabled: true,
      });
      expect(screen.getByRole('switch', { name: `${who}: see location` })).toBeTruthy();
      expect(screen.getByRole('switch', { name: `${who}: full details` })).toBeTruthy();
      expect(screen.getByRole('switch', { name: `${who}: mark resolved` })).toBeTruthy();
    }
    expect(screen.getByText('What Maya would get')).toBeTruthy();
  });

  test('step 3 shows the saved night: interval, loudness, what you are wearing, meeting spot', async () => {
    seedSavedSettings(SAVED);
    await renderApp('/setup/session');
    expect(screen.getByRole('radio', { name: 'Every 30 min' }).props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByRole('radio', { name: 'Balanced, 85 dB' }).props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByLabelText("What you're wearing").props.value).toBe('Black hoodie, white cap');
    expect(screen.getByLabelText('Meeting spot').props.value).toBe('by the bar');
    expect(screen.getByText('(optional)')).toBeTruthy();
  });

  test('step 3 says when a saved loudness is none of the three', async () => {
    seedSavedSettings({ ...SAVED, loudnessTarget: 92 });
    await renderApp('/setup/session');
    expect(screen.getByText('Set to 92 dB before. Pick one to change it.')).toBeTruthy();
    expect(screen.queryByRole('radio', { checked: true, name: /dB$/ })).toBeNull();
  });

  test('step 4 shows both PIN cards, not set on a fresh install, and names the first contact', async () => {
    seedSavedSettings(SAVED);
    await renderApp('/setup/pins');
    expect(screen.getByLabelText('Safe PIN not set')).toBeTruthy();
    expect(screen.getByLabelText('Duress PIN not set')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Set safe PIN' })).toBeTruthy();
    expect(screen.getByText(/Quietly texts Maya that you need help/)).toBeTruthy();
    expect(screen.getByText('The two PINs must be different')).toBeTruthy();
  });

  test('step 4 with stored PINs offers Change and trusts the stored pair', async () => {
    await appPinStore().setPins({ safePin: '2468', duressPin: '1357' });
    seedSavedSettings(SAVED);
    await renderApp('/setup/pins');
    expect(screen.getByRole('button', { name: 'Change safe PIN' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Change duress PIN' })).toBeTruthy();
    expect(screen.getByLabelText('Safe PIN set')).toBeTruthy();
    expect(screen.getByText('The two PINs are different')).toBeTruthy();
  });
});
