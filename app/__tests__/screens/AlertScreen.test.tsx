import { Linking } from 'react-native';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';

import type { EscalationEvent, Settings } from '../../modules/raveguard-native';
import { DEFAULT_SETTINGS } from '../../src/settings/defaults';
import { fakeFileSystem, seedSavedSettings } from '../../test-utils/fakeFiles';
import { nativeMock, PHASES } from '../../test-utils/nativeMock';
import { emitEscalation, emitPhase, renderApp } from '../../test-utils/renderApp';

// K10 (PRD D10, UI-5): the Alert screen through the real route tree, against the native mock.

const NOTIFIED_AT = new Date(2027, 0, 9, 1, 42).getTime();
const ACKED_AT = new Date(2027, 0, 9, 1, 43).getTime();
const TEAMMATE = '+14165550199';
/** The work order's done-when budget for an ack to show here. */
const ACK_BUDGET_MS = 5000;

const NOTIFYING: EscalationEvent = {
  state: 'notifying',
  sosOpen: false,
  recipients: [
    { name: 'Sam', kind: 'contact', notifiedAt: NOTIFIED_AT, ackedAt: null },
    { name: 'Riley', kind: 'contact', notifiedAt: null, ackedAt: null },
    { name: 'Door staff', kind: 'venueStaff', notifiedAt: null, ackedAt: null },
  ],
};

const ACKNOWLEDGED: EscalationEvent = {
  ...NOTIFYING,
  state: 'acknowledged',
  recipients: [{ ...NOTIFYING.recipients[0], ackedAt: ACKED_AT }, ...NOTIFYING.recipients.slice(1)],
};

function saveSettings(change: Partial<Settings>): void {
  seedSavedSettings({ ...DEFAULT_SETTINGS, ...change });
}

beforeEach(() => {
  nativeMock().reset();
  fakeFileSystem().reset();
  // React Native's Jest setup makes openURL one shared jest.fn, so clear calls between tests.
  jest.mocked(Linking.openURL).mockClear();
});

afterEach(() => jest.restoreAllMocks());

describe('Alert screen: who was texted and who acknowledged', () => {
  test('lists every recipient with when they were texted, from the snapshot', async () => {
    await renderApp('/alert', { phase: PHASES.escalated, escalation: NOTIFYING });
    expect(screen.getByText('Alert sent')).toBeTruthy();
    expect(screen.getByText('Texted 1 of 3. Waiting for someone to acknowledge.')).toBeTruthy();
    expect(screen.getByLabelText('Sam, contact. Texted 01:42. No reply yet.')).toBeTruthy();
    expect(screen.getByLabelText('Riley, contact. Not texted yet.')).toBeTruthy();
    expect(screen.getByLabelText('Door staff, venue staff. Not texted yet.')).toBeTruthy();
  });

  test('waits for the server when escalated with no status yet', async () => {
    await renderApp('/alert', { phase: PHASES.escalated });
    expect(screen.getByText('Waiting for the server…')).toBeTruthy();
  });

  test('an ack on Contact 1’s page shows as soon as onEscalation brings it, well inside 5 s', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    try {
      await renderApp('/alert', { phase: PHASES.escalated, escalation: NOTIFYING });
      const sentAt = Date.now();
      await emitEscalation(ACKNOWLEDGED);
      // No timer had to run: the ack is on screen on the event itself.
      expect(Date.now() - sentAt).toBeLessThan(ACK_BUDGET_MS);
      expect(screen.getByText('Alert acknowledged')).toBeTruthy();
      expect(screen.getByText('Sam acknowledged at 01:43. Help is on the way.')).toBeTruthy();
      expect(screen.getByLabelText('Sam, contact. Texted 01:42. Acknowledged 01:43.')).toBeTruthy();
    } finally {
      await act(async () => jest.runOnlyPendingTimers());
      jest.useRealTimers();
    }
  });

  test('a relaunch mid-alert shows the ack from the snapshot', async () => {
    await renderApp('/alert', { phase: PHASES.escalated, escalation: ACKNOWLEDGED });
    expect(screen.getByText('Sam acknowledged at 01:43. Help is on the way.')).toBeTruthy();
  });

  test('hands over to the SOS screen once the module reaches it', async () => {
    const app = await renderApp('/alert', { phase: PHASES.escalated, escalation: NOTIFYING });
    await emitPhase(PHASES.sos);
    expect(app.getPathname()).toBe('/sos');
    expect(screen.getByText('SOS')).toBeTruthy();
    expect(screen.getByText('No one has answered yet')).toBeTruthy();
  });

  test('says SOS from sosOpen too', async () => {
    await renderApp('/alert', { phase: PHASES.escalated, escalation: NOTIFYING });
    await emitEscalation({ ...NOTIFYING, sosOpen: true });
    expect(screen.getByText('SOS')).toBeTruthy();
  });
});

describe('Alert screen: navigation', () => {
  test('opens from an escalation while the wearer is elsewhere', async () => {
    const app = await renderApp('/session', { phase: PHASES.monitoring });
    await emitPhase(PHASES.escalated);
    expect(app.getPathname()).toBe('/alert');
  });

  test('Enter PIN opens PIN entry and stays there while still escalated', async () => {
    const app = await renderApp('/alert', { phase: PHASES.escalated, escalation: NOTIFYING });
    fireEvent.press(screen.getByRole('button', { name: 'Enter PIN to cancel' }));
    await waitFor(() => expect(app.getPathname()).toBe('/pin'));
    await emitEscalation(NOTIFYING);
    expect(app.getPathname()).toBe('/pin');
  });

  test('offers the way back once resolved', async () => {
    const app = await renderApp('/alert', { phase: PHASES.escalated, escalation: NOTIFYING });
    expect(screen.queryByRole('button', { name: 'Back to session' })).toBeNull();
    await emitEscalation({ ...ACKNOWLEDGED, state: 'resolved' });
    await emitPhase(PHASES.monitoring);
    expect(screen.getByText('Alert resolved')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Back to session' }));
    await waitFor(() => expect(app.getPathname()).toBe('/session'));
  });
});

// Alert's own Call. At `sos` the wearer is on the SOS screen, whose Call follows the same
// demo-only rule (SosScreen.test.tsx).
describe('Alert screen: Call (demo: the teammate only)', () => {
  test('in demo mode, Call dials the teammate’s number and nothing else', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    saveSettings({ demo: true, teammatePhone: TEAMMATE });
    await renderApp('/alert', { phase: PHASES.escalated, escalation: { ...NOTIFYING, sosOpen: true } });
    const call = await screen.findByRole('button', { name: 'Call teammate' });
    await waitFor(() => expect(call).toBeEnabled());
    expect(screen.getByText(`Demo mode: rings your teammate at ${TEAMMATE}.`)).toBeTruthy();
    fireEvent.press(call);
    await waitFor(() => expect(openURL).toHaveBeenCalledTimes(1));
    expect(openURL).toHaveBeenCalledWith(`tel:${TEAMMATE}`);
  });

  test('outside demo mode, Call is off and dials nothing', async () => {
    const openURL = jest.spyOn(Linking, 'openURL');
    saveSettings({ demo: false, teammatePhone: TEAMMATE });
    await renderApp('/alert', { phase: PHASES.escalated, escalation: NOTIFYING });
    expect(
      await screen.findByText('Calling is only on in demo mode. RaveGuard never dials emergency services.')
    ).toBeTruthy();
    const call = screen.getByRole('button', { name: 'Call teammate' });
    expect(call).toBeDisabled();
    fireEvent.press(call);
    expect(openURL).not.toHaveBeenCalled();
  });

  test('in demo mode with no teammate number, Call says where to add one', async () => {
    const openURL = jest.spyOn(Linking, 'openURL');
    await renderApp('/alert', { phase: PHASES.escalated, escalation: NOTIFYING });
    expect(screen.getByText("Add your teammate's number on the Debug screen to call from here.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Call teammate' })).toBeDisabled();
    expect(openURL).not.toHaveBeenCalled();
  });

  test('a phone that cannot call says so and shows the number', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no phone app'));
    saveSettings({ demo: true, teammatePhone: TEAMMATE });
    await renderApp('/alert', { phase: PHASES.escalated, escalation: NOTIFYING });
    const call = await screen.findByRole('button', { name: 'Call teammate' });
    await waitFor(() => expect(call).toBeEnabled());
    fireEvent.press(call);
    expect(await screen.findByText(`Couldn't start the call. Dial ${TEAMMATE} yourself.`)).toBeTruthy();
  });

  test('never calls on its own, even at SOS', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    saveSettings({ demo: true, teammatePhone: TEAMMATE });
    await renderApp('/alert', { phase: PHASES.escalated, escalation: NOTIFYING });
    await emitPhase(PHASES.sos);
    await emitEscalation({ ...NOTIFYING, sosOpen: true });
    expect(openURL).not.toHaveBeenCalled();
  });
});
